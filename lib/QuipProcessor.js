const QuipService =  require('./QuipService');
const Mime = require ('mime');
const ejs = require ('ejs');
const sanitizeFilename = require("sanitize-filename");
const LoggerAdapter = require('./common/LoggerAdapter');
const blobImageToURL = require('./common/blobImageToURL');
const checkValidBlob = require('./common/checkValidBlob');


class QuipProcessor {
    constructor (quipToken, saveCallback = ()=>{}, progressCallback = ()=>{}, phaseCallback = ()=>{}, options={}) {
        this.quipToken = quipToken;
        this.saveCallback = saveCallback;
        this.progressCallback = progressCallback;
        this.phaseCallback = phaseCallback;
        this.options = options;
        this.logger = new LoggerAdapter();

        this.start = false;
        this.threadsProcessed = 0;
        this.foldersProcessed = 0;

        this.threadsTotal = 0;
        this.foldersTotal = 0;

        this.referencesMap = new Map();

        this.phase = 'STOP'; //START, STOP, ANALYSIS, EXPORT

        this.quipService = new QuipService(quipToken, options.quipApiURL);

        //parse options
        if(options.documentTemplate) {
            this.documentTemplate = options.documentTemplate;
        } else {
            console.error("Document template is not set!");
        }
    }

    setLogger(logger) {
        this.logger = logger;
        this.logger.debug("-".repeat(80));
        this.quipService.setLogger(logger);
    }

    async startExport(folderIds) {
        this._changePhase('START');

        this.start = true;
        this.threadsProcessed = 0;

        this.quipUser = await this.quipService.getUser();
        if(!this.quipUser) {
            this.logger.error("Can't load the User");
            this.stopExport();
            return;
        }
        this.logger.debug("USER-URL: " + this.quipUser.url);

        let folderIdsToExport = [];

        if(folderIds && folderIds.length > 0) {
            folderIdsToExport = folderIds;
        } else {
            let {folderImport} = this.options;
            if (!folderImport || folderImport === 'private') {
                folderIdsToExport.push(this.quipUser.private_folder_id);
            }

            if (!folderImport || folderImport === 'shared') {
                folderIdsToExport = folderIdsToExport.concat(this.quipUser.shared_folder_ids);
            }

            if (!folderImport || folderImport === 'group') {
                folderIdsToExport = folderIdsToExport.concat(this.quipUser.group_folder_ids);
            }
        }

        await this._exportFolders(folderIdsToExport);

        this.stopExport();
    }

    stopExport() {
        this.start = false;
        this._changePhase('STOP');
    }

    _changePhase(phase) {
        this.phaseCallback(phase, this.phase);
        this.phase = phase;
    }

    _getMatches(text, regexp) {
        const matches = [];

        let regexpResult = regexp.exec(text);

        while (regexpResult != null) {
            matches.push({
                replacement: regexpResult[1],
                threadId: regexpResult[2],
                blobId: regexpResult[3],
                fileName: regexpResult[4]
            });
            regexpResult = regexp.exec(text);
        }

        return matches;
    }

    async _resolveReferences(html, pathDeepness) {
        //look up for document or folder references
        const regexp = new RegExp(`href=\\"(${this.quipUser.url}/([\\w-]+))\\"`, 'gim');
        const matchesReference = this._getMatches(html, regexp);

        //replace references to documents
        if(this.options.resolveReferences) {
            for(const reference of matchesReference) {
                html = await this._processReference(html, reference, pathDeepness);
            }
        }

        return html;
    }

    async _processReference(html, reference, pathDeepness) {
        let referencedObject = this.referencesMap.get(reference.threadId);

        let path, folder, title;
        if(referencedObject) {
            path    = referencedObject.path;
            folder  = referencedObject.folder;
            title   = referencedObject.title;
        }

        if(!path) {
            //correct path for threads
            const referencedThread = await this.quipService.getThread(reference.threadId);
            if(!referencedThread) {
                this.logger.debug("_processReference: Couldn't load Thread with id=" + reference.threadId);
                return html;
            }
            referencedObject = this.referencesMap.get(referencedThread.thread.id);
            if(referencedObject) {
                path = referencedObject.path;
                folder = false;
                title = referencedThread.thread.title;
            } else {
                this.logger.debug("_processReference: Couldn't find referencedObject for ThreadId=" + reference.threadId);
            }
        }

        if(!path || !title) {
            this.logger.debug(`_processReference: path=${path}, title=${title}` + reference.threadId);
            return html;
        }

        if(folder) {
            path = '../'.repeat(pathDeepness) + path + title;
        } else {
            path = '../'.repeat(pathDeepness) + path + sanitizeFilename(title.trim()) + '.html';
        }

        this.logger.debug(`_processReference: replacement=${reference.replacement}, path=${path}`);
        return html.replace(reference.replacement, path);
    }

    async _processDocumentThread(quipThread, path) {
        //look up for images in html
        let regexp = new RegExp("src='(/blob/([\\w-]+)/([\\w-]+))'", 'gim');
        const matchesImg = this._getMatches(quipThread.html, regexp);

        //look up for links in html
        regexp = new RegExp('href=\\"(.*/blob/(.+)/(.+)\\?name=(.+))\\"', 'gim');
        const matchesLink = this._getMatches(quipThread.html, regexp);

        const pathDeepness = path.split("/").length-1;
        let wrappedHtml = quipThread.html;

        const documentRenderOptions = {
            title: quipThread.thread.title,
            body: quipThread.html,
            stylesheet_path: '',
            embedded_stylesheet: this.options.documentCSS
        };

        if(!this.options.documentCSS) {
            documentRenderOptions.stylesheet_path = '../'.repeat(pathDeepness) + 'document.css';
        }

        if(this.documentTemplate) {
            //wrap html code
            wrappedHtml = ejs.render(this.documentTemplate, documentRenderOptions);
        }

        //replace blob references for links
        for(const link of matchesLink) {
            wrappedHtml = await this._processFile(wrappedHtml, link, path);
        }

        //replace blob references for images
        for(const image of matchesImg) {
            wrappedHtml = await this._processFile(wrappedHtml, image, path, this.options.embeddedImages);
        }

        //replace references to documents
        if(this.options.resolveReferences) {
            wrappedHtml = await this._resolveReferences(wrappedHtml, pathDeepness);
        }

        this.saveCallback(wrappedHtml, sanitizeFilename(`${quipThread.thread.title.trim()}.html`), 'THREAD', path);
    }

    async _processSlidesThread(quipThread, path) {
        const blob = await this.quipService.getPdf(quipThread.thread.id);
        if(blob) {
            const fileName = sanitizeFilename(`${quipThread.thread.title.trim()}.pdf`);
            this.saveCallback(blob, fileName, "BLOB", `${path}`);
        } else {
            this.logger.warn("Can't load Slides as PDF, thread.id="  + quipThread.thread.id +
                ", thread.title=" + quipThread.thread.title +
                ", thread.type=" +  quipThread.thread.type + ", path=" +  path);
        }
    }

    async _processSpreadsheetThread(quipThread, path) {
        const blob = await this.quipService.getXlsx(quipThread.thread.id);
        if(blob) {
            const fileName = sanitizeFilename(`${quipThread.thread.title.trim()}.xlsx`);
            this.saveCallback(blob, fileName, "BLOB", `${path}`);
        } else {
            this.logger.warn("Can't load Spreadsheet as PDF, thread.id="  + quipThread.thread.id +
                ", thread.title=" + quipThread.thread.title +
                ", thread.type=" +  quipThread.thread.type + ", path=" +  path);
        }
    }

    async _processDocumentThreadAsDocx(quipThread, path) {
        const blob = await this.quipService.getDocx(quipThread.thread.id);
        if(blob) {
            const fileName = sanitizeFilename(`${quipThread.thread.title.trim()}.docx`);
            this.saveCallback(blob, fileName, "BLOB", `${path}`);
        } else {
            this.logger.warn("Can't load Document as DOCX, thread.id="  + quipThread.thread.id +
                ", thread.title=" + quipThread.thread.title +
                ", thread.type=" +  quipThread.thread.type + ", path=" +  path);
        }
    }

    async _processThread(quipThread, path) {
        if(!quipThread.thread) {
            const quipThreadCopy = Object.assign({}, quipThread);
            quipThreadCopy.html = '...';
            this.logger.error("quipThread.thread is not defined, thread="  + JSON.stringify(quipThreadCopy, null, 2) + ", path=" +  path);
            return;
        }

        if(['document', 'spreadsheet'].includes(quipThread.thread.type)) {
            if(this.options.gdrive) {
                if(quipThread.thread.type === 'document') {
                    await this._processDocumentThreadAsDocx(quipThread, path);
                } else if(quipThread.thread.type === 'spreadsheet') {
                    await this._processSpreadsheetThread(quipThread, path);
                }
            } else {
                await this._processDocumentThread(quipThread, path);
            }
        }
        else {
            this.logger.warn("Thread type is not supported, thread.id="  + quipThread.thread.id +
                ", thread.title=" + quipThread.thread.title +
                ", thread.type=" +  quipThread.thread.type + ", path=" +  path);
        }

        this.threadsProcessed++;
    }

    async _processFile(html, file, path, asImage=false) {
        const blob = await this.quipService.getBlob(file.threadId, file.blobId);
        if(blob) {
            if(asImage) {
                const imageURL = await blobImageToURL(blob);
                html = html.replace(file.replacement, imageURL);
            } else {
                const isValidBlob = checkValidBlob(file, blob);
                if(isValidBlob) {
                    let fileName;
                    if(file.fileName) {
                        fileName = file.fileName.trim();
                    } else {
                        fileName = `${file.blobId.trim()}.${Mime.getExtension(blob.type).trim()}`;
                    }
                    fileName = sanitizeFilename(fileName);
    
                    html = html.replace(file.replacement, `blobs/${fileName}`);
                    //blob.size
                    this.saveCallback(blob, fileName, "BLOB", `${path}blobs`);
                }
            }
        } else {
            this.logger.error("Can't load the file " + file.replacement + " in path = " + path);
        }

        return html;
    }

    async _processThreads(quipThreads, path) {
        const promises = [];
        for(const index in quipThreads) {
            promises.push(this._processThread(quipThreads[index], path));
        }
        await Promise.all(promises);
    }

    async _processFolders(quipFolders, path) {
        const promises = [];
        for(const index in quipFolders) {
            promises.push(this._processFolder(quipFolders[index], `${path}${quipFolders[index].folder.title}/`));
        }
        await Promise.all(promises);
    }

    async _processFolder(quipFolder, path) {
        const threadIds = [];
        const folderIds = [];

        for(const index in quipFolder.children) {
            const quipChild = quipFolder.children[index];

            if(quipChild.thread_id) { //thread
                threadIds.push(quipChild.thread_id);
            } else if(quipChild.folder_id) { //folder
                folderIds.push(quipChild.folder_id);
            }
        }

        if(threadIds.length > 0) {
            const threads = await this.quipService.getThreads(threadIds);
            if(threads) {
                await this._processThreads(threads, path);
            } else {
                this.logger.error("Can't load the Child-Threads for Folder: " + path)
            }
        }

        if(folderIds.length > 0) {
            const folders = await this.quipService.getFolders(folderIds);
            if(folders) {
                await this._processFolders(folders, path);
            } else {
                this.logger.error("Can't load the Child-Folders for Folder: " + path);
            }
        }

        this.foldersProcessed++;
        this._progressReport({
            threadsProcessed: this.threadsProcessed,
            threadsTotal: this.threadsTotal,
            path: path
        });
    }

    async _countThreadsAndFolders(quipFolder, path) {
        const threadIds = [];
        const folderIds = [];

        if(this.options.resolveReferences) {
            this.referencesMap.set(quipFolder.folder.id, {
                path,
                folder: true,
                title: quipFolder.folder.title
            });
        }

        if(!quipFolder.children || quipFolder.children.length === 0) {
            return;
        }

        const pathForChildren = `${path}${quipFolder.folder.title}/`;

        for(const index in quipFolder.children) {
            const quipChild = quipFolder.children[index];
            if(quipChild.thread_id) { //thread
                threadIds.push(quipChild.thread_id);
                if(this.options.resolveReferences) {
                    this.referencesMap.set(quipChild.thread_id, {
                        path: pathForChildren
                    });
                }
            } else if(quipChild.folder_id) { //folder
                folderIds.push(quipChild.folder_id);
            }
        }

        this.threadsTotal += threadIds.length;
        this.foldersTotal += folderIds.length;

        this._progressReport({
            readFolders: this.foldersTotal,
            readThreads: this.threadsTotal
        });

        let childFolders = [];
        if(folderIds.length > 0) {
            childFolders = await this.quipService.getFolders(folderIds);
            if(!childFolders) {
                return;
            }
        }

        for(const index in childFolders) {
            await this._countThreadsAndFolders(childFolders[index], pathForChildren);
        }
    }

    async _exportFolders(folderIds) {
        this._changePhase('ANALYSIS');

        this.threadsTotal = 0;
        this.foldersTotal = 0;

        const quipFolders = await this.quipService.getFolders(folderIds);
        if(!quipFolders) {
            this._changePhase('STOP');
            this.logger.error("Can't read the root folders");
            return;
        }

        for(const index in quipFolders) {
            await this._countThreadsAndFolders(quipFolders[index], "");
        }

        this._changePhase('EXPORT');
        return this._processFolders(quipFolders, "");
    }

    _progressReport(progress) {
        this.progressCallback(progress);
    }
}

module.exports = QuipProcessor;
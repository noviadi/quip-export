const Mime = require ('mime');

function checkValidBlob(file, blob) {
    if (file.fileName) return true;
    if (typeof blob.type === 'string') {
        return !!Mime.getExtension(blob.type);
    }
    return false;
}

module.exports = checkValidBlob;

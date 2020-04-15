const commandLineArgs = require('command-line-args');
const colors = require('colors');
const mkdirp = require('mkdirp');

const options = require('./options');
const help = require('./help');
const pkgVersion = require('../../package.json').version;

module.exports = function() {
    try {
        var cliArguments = commandLineArgs(options);
    } catch(e) {
        throw colors.red(e.message);
    }

    if(cliArguments.help || Object.keys(cliArguments).length === 0) {
        throw help();
    }

    if(cliArguments.version) {
        throw pkgVersion;
    }

    if(!cliArguments.token) {
        throw colors.red('ERROR: Token is not defined.');
    }

    if(cliArguments.destination) {
        try {
            mkdirp.sync(cliArguments.destination);
        } catch (e) {
            throw colors.red('ERROR: Destination folder is wrong.');
        }
    }

    if(cliArguments['private-only']) {
        cliArguments.folderImport = 'private';
    } else if(cliArguments['shared-only']) {
        cliArguments.folderImport = 'shared';
    } else if(cliArguments['group-only']) {
        cliArguments.folderImport = 'group';
    }

    return cliArguments;
};

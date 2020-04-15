function checkValidBlob(blob) {
    if (typeof blob.type === 'string') {
        if (blob.type.startsWith('application/x-www-form-urlencoded')) return false;
        return true;
    }
    return false;
}

module.exports = checkValidBlob;

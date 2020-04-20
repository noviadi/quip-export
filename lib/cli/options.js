module.exports =
[
  {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: 'Display this usage guide.'
  },
  {
    name: 'version',
    alias: 'v',
    type: Boolean,
    description: 'Print version info'
  },
  {
    name: 'token',
    alias: 't',
    type: String,
    description: 'Quip Access Token. To generate a personal access token, visit the page: <https://quip.com/dev/token>',
    typeLabel: '{underline string}'
  },
  {
    name: 'destination',
    alias: 'd',
    type: String,
    description: 'Destination folder for export files',
    typeLabel: '{underline string}'
  },
  {
    name: 'zip',
    alias: 'z',
    type: Boolean,
    description: 'Zip export files'
  },
  {
    name: 'embedded-styles',
    type: Boolean,
    description: 'Embedded in each document stylesheet'
  },
  {
      name: 'embedded-images',
      type: Boolean,
      description: 'Embedded images'
  },
  {
    name: 'resolve-references',
    type: Boolean,
    description: 'Resolves references to other Quip documents and folders to a proper relative path'
  },
  {
    name: 'debug',
    type: Boolean,
    description: 'Debug mode'
  },
  // Custom arguments
  {
    name: 'folders',
    alias: 'f',
    type: String,
    multiple: true,
    description: 'Export specific folder ids',
  },
  {
    name: 'private-only',
    type: Boolean,
    description: 'Export private folder only',
  },
  {
    name: 'shared-only',
    type: Boolean,
    description: 'Export shared folders only',
  },
  {
    name: 'group-only',
    type: Boolean,
    description: 'Export group folders only',
  },
  {
    name: 'gdrive',
    type: Boolean,
    description: 'Export in gdrive format, e.g. docx, xslx',
  },
  {
    name: 'analyze',
    type: Boolean,
    description: 'Analyze only',
  },
];

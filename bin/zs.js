#!/usr/bin/env node
'use strict';
// index.js only auto-parses when run directly (require.main === module), which is
// false when loaded through this wrapper. Drive the parse explicitly so the `zs`
// binary actually executes commands.
require('../dist/index.js').program.parse(process.argv);

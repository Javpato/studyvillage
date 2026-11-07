import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const version=JSON.parse(await readFile('package.json','utf8')).version,tag=process.env.RELEASE_TAG;
if(tag!=='v'+version)throw Error('Tag and package version differ');
const remote=execFileSync('git',['ls-remote','origin',`refs/tags/${tag}`,`refs/tags/${tag}^{}`],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
const existing=remote.find(line=>line.endsWith('^{}'))||remote[0];
if(existing&&existing.split(/\s/)[0]!==process.env.GITHUB_SHA)throw Error('The existing tag belongs to a different commit; use a new development version');

import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {publishedFiles} from './release-targets.mjs';
const tag=process.env.RELEASE_TAG,commit=process.env.GITHUB_SHA;if(!tag||!commit)throw Error('Missing release tag or source commit');
execFileSync('gh',['release','create',tag,...publishedFiles().map(name=>path.join('deliverables/release-current',name)),'--target',commit,'--prerelease','--title',`StudyVillage ${tag}`,'--notes-file','docs/RELEASE_NOTES.md'],{stdio:'inherit'});

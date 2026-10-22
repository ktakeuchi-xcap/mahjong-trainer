// dist/ の内容を gh-pages ブランチとして origin に強制pushする
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const remote = execSync('git remote get-url origin').toString().trim();
const run = (cmd) => execSync(cmd, { cwd: 'dist', stdio: 'inherit' });
writeFileSync('dist/.nojekyll', '');
run('git init -q -b gh-pages');
run('git add -A');
run('git -c user.name="deploy" -c user.email="deploy@localhost" commit -q -m "Deploy"');
run(`git push -f ${remote} gh-pages`);
execSync('rm -rf dist/.git');

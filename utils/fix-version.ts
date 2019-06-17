/**
 * Created by user on 2019/6/18.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import globby from 'globby';
import * as _pkg from '../package.json';

const ROOT = path.join(__dirname, '..');

globby(_pkg.workspaces.map(v => path.join(v, 'package.json')), {
  absolute: true,
  cwd: ROOT,
}).then((ls: string[]) => {
  let pkgMap = ls.reduce(
    (a, file) => {
      let json = fs.readJSONSync(file);
      let name = json.name;
      let version = json.version;
      a[name] = {
        version,
        file,
        json,
      };
      return a;
    },
    {} as {
      [k: string]: {
        version: string;
        json: {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
          peerDependencies?: Record<string, string>;
        };
        file: string;
      };
    }
  );

  Object.keys(pkgMap).forEach(name => {
    let data = pkgMap[name];
    let changed = false;
    let label = path.relative(ROOT, data.file);

    console.log(`[check]`, label);

    ['dependencies', 'devDependencies', 'peerDependencies'].forEach(key => {
      if (data.json[key]) {
        Object.entries(data.json[key]).forEach(([d, v]: [string, string]) => {
          if (d in pkgMap) {
            data.json[key][d] = v.replace(/(?<=^[\^~]?).+$/, sv => {
              if (sv != pkgMap[d].version) {
                changed = true;
                return pkgMap[d].version;
              }

              return sv;
            });
          }
        });
      }
    });

    if (changed) {
      console.log(`[changed]`, label);
      fs.writeJSONSync(data.file, data.json, {
        spaces: 2,
      });
    }
  });
});

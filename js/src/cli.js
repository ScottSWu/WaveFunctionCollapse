import * as fs from 'fs';
import * as path from 'path';
import process from 'process';

import get_pixels from 'get-pixels';
import save_pixels from 'save-pixels';

import { DEBUG } from './options.js';
import { OverlappingModel } from './overlapping_model.js';

if (process.argv.length < 3) {
    console.log("Usage: node wfc-cli.js <input image or xml>");
}
else {
    const inputFile = process.argv[2];
    const ext = path.extname(inputFile).toLowerCase();
    if (ext == ".png") {
        // Defalt overlapping model
        get_pixels(inputFile, (err, image) => {
            if (err) {
                console.log("Error: ", err);
            }
            else {
                if (DEBUG) console.log("Done read");
                const model = new OverlappingModel(image, 3, 48, 48, true, true, 8, 0);
                if (DEBUG) console.log("Done constructor");
                model.run(0, 0);
                if (DEBUG) console.log("Done run");
                const outFile = fs.createWriteStream("out.png");
                save_pixels(model.getImage(), "png").pipe(outFile);
                if (DEBUG) console.log("Done write");
            }
        });
    }
    else if (ext == ".xml") {
        // TODO
        console.log("Error: Unimplemented");
        process.exit(1);
    }
    else {
        console.log("Error: Filetype must be png (overlapping) or xml (tiled)");
        process.exit(1);
    }
}

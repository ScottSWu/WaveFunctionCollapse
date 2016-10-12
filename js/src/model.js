/*
The MIT License(MIT)
Copyright(c) mxgmn 2016.
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
The software is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose and noninfringement. In no event shall the authors or copyright holders be liable for any claim, damages or other liability, whether in an action of contract, tort or otherwise, arising from, out of or in connection with the software or the use or other dealings in the software.
*/

import { DEBUG } from './options.js';

import * as fs from 'fs';
let rdata = [];
if (DEBUG) {
    rdata = fs.readFileSync("../random.txt").toString().split("\n")
        .map(line => parseFloat(line));
}
let rindex = 0;

function gen_random() {
    if (DEBUG) {
        let num = rdata[rindex];
        rindex = (rindex + 1) % rdata.length;
        return num;
    }
    else {
        return Math.random();
    }
}

function pick_random(arr, threshold) {
    let sum = arr.reduce((acc, x) => acc + x);
    if (sum == 0.0) {
        sum = arr.length;
        arr = arr.map(_ => 1.0);
    }
    arr = arr.map(x => x / sum);

    let x = 0;
    for (let i = 0; i < arr.length; i++) {
        x += arr[i];
        if (threshold <= x) {
            return i;
        }
    }

    return 0;
}

export class Model {
    constructor() {
        this.wave = [[[]]];     // boolean[][][]
        this.changes = [[]];    // boolean[][]
        this.stationary = [];   // number[] (double[])

        this.FMX = 0;           // number (int)
        this.FMY = 0;           // number (int)
        this.T = 0;             // number (int)
        this.limit = 1;         // number (int)
        this.periodic = false;  // boolean
        this.logProb = [];      // number[] (double[])
        this.logT = 0.0;        // number (double)
    }

    /**
     * @return boolean
     */
    propagate() {
    }

    /**
     * @return boolean | null
     */
    observe() {
        let min = 1e3;
        let argminx = -1;
        let argminy = -1;

        //console.log(this.stationary.join(" "));
        //console.log(this.logProb.join(" "));
        //console.log(this.FMX, this.FMY, this.T, this.logT);

        for (let x = 0; x < this.FMX; x++) {
            for (let y = 0; y < this.FMY; y++) {
                if (this.onBoundary(x, y)) {
                    continue;
                }

                let amount = 0;
                let sum = 0;

                for (let t = 0; t < this.T; t++) {
                    if (this.wave[x][y][t]) {
                        amount++;
                        sum += this.stationary[t];
                    }
                }

                if (sum == 0) {
                    return false;
                }

                let noise = 1e-6 * gen_random(); // random from [0, 1)

                let entropy;
                if (amount == 1) {
                    entropy = 0;
                }
                else if (amount == this.T) {
                    entropy = this.logT;
                }
                else {
                    const logSum = Math.log(sum);
                    let mainSum = 0;
                    for (let t = 0; t < this.T; t++) {
                        if (this.wave[x][y][t]) {
                            mainSum += this.stationary[t] * this.logProb[t];
                        }
                    }

                    entropy = logSum - mainSum / sum;
                }

                if (entropy > 0 && entropy + noise < min) {
                    if (DEBUG) console.log("Model: observe", x, y, entropy, noise, min);
                    min = entropy + noise;
                    argminx = x;
                    argminy = y;
                }
            }
        }

        if (argminx == -1 && argminy == -1) {
            return true;
        }

        const distribution = this.stationary.map((v, t) =>
            this.wave[argminx][argminy][t] ? v : 0);
        const r = pick_random(distribution, gen_random());

        for (let t = 0; t < this.T; t++) {
            this.wave[argminx][argminy][t] = t == r;
        }
        this.changes[argminx][argminy] = true;

        return null;
    }

    /**
     * @param number (int)
     * @param number (int)
     * @return boolean
     */
    run(seed, limit) {
        this.logT = Math.log(this.T);
        this.logProb = this.stationary.map(x => Math.log(x));

        this.clear();

        for (let l = 0; l < limit || limit == 0; l++) {
            const result = this.observe();
            if (DEBUG) console.log("Model: run -> ", result);
            if (result != null) {
                return result;
            }
            while (this.propagate()) {
                if (DEBUG) console.log("Model: Propagating");
            }
        }
    }

    clear() {
        for (let x = 0; x < this.FMX; x++) {
            for (let y = 0; y < this.FMY; y++) {
                for (let t = 0; t < this.T; t++) {
                    this.wave[x][y][t] = true;
                }
                this.changes[x][y] = false;
            }
        }
    }

    /**
     * @param number (int)
     * @param number (int)
     * @return boolean
     */
    onBoundary(x, y) {
        return false;
    }

    /**
     * @return ndarray
     */
    getImage() {
    }
}

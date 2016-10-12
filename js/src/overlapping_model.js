/*
The MIT License(MIT)
Copyright(c) mxgmn 2016.
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
The software is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose and noninfringement. In no event shall the authors or copyright holders be liable for any claim, damages or other liability, whether in an action of contract, tort or otherwise, arising from, out of or in connection with the software or the use or other dealings in the software.
*/

import { DEBUG } from './options.js';
import { Model } from './model.js';
import ndarray from 'ndarray';

function color_equal(a, b) {
    return a[0] == b[0] && a[1] == b[1] && a[2] == b[2];
}

export class OverlappingModel extends Model {
    /**
     * @param image     ndarray (width x height x channels)
     * @param N         number (int)
     * @param width     number (int)
     * @param height    number (int)
     * @param periodicInput     boolean
     * @param periodicOutput    boolean
     * @param symmetry  number (int)
     * @param ground    number (int)
     */
    constructor(image, N, width, height, periodicInput, periodicOutput, symmetry, ground) {
        super();
        this.image = image;
        this.N = N;
        this.FMX = width;
        this.FMY = height;
        this.periodicInput = periodicInput;
        this.periodic = periodicOutput;
        this.symmetry = symmetry;
        this.ground = ground;

        const SMX = this.image.shape[0];
        const SMY = this.image.shape[1];
        const sample = ndarray(new Uint8Array(SMX * SMY), [SMX, SMY]);
        this.colors = [];

        if (DEBUG) console.log("Overlapping Model: Getting colors");
        for (let y = 0; y < SMY; y++) {
            for (let x = 0; x < SMX; x++) {
                const pick = this.image.pick(x, y, null);
                const color = [ pick.get(0), pick.get(1), pick.get(2) ];
                let i = 0;
                for (const c of this.colors) {
                    if (color_equal(c, color)) {
                        break;
                    }
                    else {
                        i++;
                    }
                }

                if (i == this.colors.length) {
                    this.colors.push(color);
                }
                sample.set(x, y, i);
            }
        }

        const C = this.colors.length;
        const W = Math.pow(C, this.N * this.N);

        const pattern = f => {
            const result = new Uint8Array(this.N * this.N);
            for (let y = 0; y < this.N; y++) {
                for (let x = 0; x < this.N; x++) {
                    result[x + y * N] = f(x, y);
                }
            }
            return result;
        };

        const patternFromSample = (x, y) =>
            pattern((dx, dy) => sample.get((x + dx) % SMX, (y + dy) % SMY));
        const rotate = p => pattern((x, y) => p[N - 1 - y + x * N]);
        const reflect = p => pattern((x, y) => p[N - 1 - x + y * N]);

        const index = p => {
            let result = 0;
            let power = 1;
            for (let i = p.length - 1; i >= 0; i--) {
                result += p[i] * power;
                power *= C;
            }
            return result;
        };
        const patternFromIndex = ind => {
            let residue = ind;
            let power = W;
            const result = new Uint8Array(this.N * this.N);
            for (let i = 0; i < result.length; i++) {
                power /= C;
                let count = 0;

                while (residue >= power) {
                    residue -= power;
                    count++;
                }

                result[i] = count;
            }
            return result;
        };

        if (DEBUG) console.log("Overlapping Model: Weights and ordering");
        const weights = new Map();
        const ordering = [];
        for (let y = 0; y < (this.periodicInput ? SMY : SMY - N + 1); y++) {
            for (let x = 0; x < (this.periodicInput ? SMX : SMX - N + 1); x++) {
                const ps = [];
                ps.push(patternFromSample(x, y));
                ps.push(reflect(ps[0]));
                ps.push(rotate(ps[0]));
                ps.push(reflect(ps[2]));
                ps.push(rotate(ps[2]));
                ps.push(reflect(ps[4]));
                ps.push(rotate(ps[4]));
                ps.push(reflect(ps[6]));

                for (let k = 0; k < this.symmetry; k++) {
                    let ind = index(ps[k]);
                    if (weights.has(ind)) {
                        weights.set(ind, weights.get(ind) + 1);
                    }
                    else {
                        weights.set(ind, 1);
                        ordering.push(ind);
                    }
                }
            }
        }

        this.T = weights.size;
        this.ground = (this.ground + this.T) % this.T;

        this.patterns = [];
        this.stationary = [];
        this.propagator = [];

        for (const w of ordering) {
            this.patterns.push(patternFromIndex(w));
            this.stationary.push(weights.get(w));
        }

        if (DEBUG) console.log("Overlapping Model: Initialize wave and changes");
        this.wave = [];
		this.changes = [];
        for (let x = 0; x < this.FMX; x++) {
            this.wave.push([]);
            this.changes.push([]);
            for (let y = 0; y < this.FMY; y++) {
                this.wave[x].push([]);
                this.changes[x].push(false);
                for (let t = 0; t < this.T; t++) {
                    this.wave[x][y].push(true);
                }
            }
        }

        const agrees = (p1, p2, dx, dy) => {
            const xmin = (dx < 0) ? 0 : dx;
            const xmax = (dx < 0) ? dx + this.N : this.N;
            const ymin = (dy < 0) ? 0 : dy;
            const ymax = (dy < 0) ? dy + this.N : this.N;
            for (let y = ymin; y < ymax; y++) {
                for (let x = xmin; x < xmax; x++) {
                    if (p1[x + this.N * y] != p2[x - dx + this.N * (y - dy)]) {
                        return false;
                    }
                }
            }
            return true;
        };

        if (DEBUG) console.log("Overlapping Model: Initialize propagator");
        for (let t = 0; t < this.T; t++) {
            this.propagator.push([]);
            for (let x = 0; x < 2 * this.N - 1; x++) {
                this.propagator[t].push([]);
                for (let y = 0; y < 2 * this.N - 1; y++) {
                    this.propagator[t][x].push([]);
                    const list = [];
                    for (let t2 = 0; t2 < this.T; t2++) {
                        if (agrees(this.patterns[t], this.patterns[t2], x - this.N + 1, y - this.N + 1)) {
                            list.push(t2);
                        }
                    }
                    for (let c = 0; c < list.length; c++) {
                        this.propagator[t][x][y].push(list[c]);
                    }
                }
            }
        }
    }

    onBoundary(x, y) {
        return !this.periodic && (x + this.N > this.FMX || y + this.N > this.FMY);
    }

    propagate() {
        let change = false;
        let count = 0;
        for (let x1 = 0; x1 < this.FMX; x1++) {
            for (let y1 = 0; y1 < this.FMY; y1++) {
                if (this.changes[x1][y1]) {
                    count++;
                    this.changes[x1][y1] = false;
                    for (let dx = -this.N + 1; dx < this.N; dx++) {
                        for (let dy = -this.N + 1; dy < this.N; dy++) {
                            let x2 = x1 + dx;
                            let y2 = y1 + dy;

                            let sx = x2;
                            if (sx < 0) {
                                sx += this.FMX;
                            }
                            else if (sx >= this.FMX) {
                                sx -= this.FMX;
                            }

                            let sy = y2;
                            if (sy < 0) {
                                sy += this.FMY;
                            }
                            else if (sy >= this.FMY) {
                                sy -= this.FMY;
                            }

                            if (!this.periodic && (sx + this.N > this.FMX || sy + this.N > this.FMY)) {
                                continue;
                            }

                            let allowed = this.wave[sx][sy];
                            for (let t2 = 0; t2 < this.T; t2++) {
                                if (!allowed[t2]) {
                                    continue;
                                }

                                let b = false;
                                let prop = this.propagator[t2][this.N - 1 - dx][this.N - 1 - dy];
                                //console.log("Prop:", dx, dy, t2);
                                //console.log(prop.join(" "));
                                for (let i1 = 0; i1 < prop.length && !b; i1++) {
                                    b = this.wave[x1][y1][prop[i1]];
                                }
                                if (!b) {
                                    this.changes[sx][sy] = true;
                                    change = true;
                                    allowed[t2] = false;
                                }
                            }
                        }
                    }
                }
            }
        }
        if (DEBUG) console.log("Changes:", count);
        return change;
    }

    clear() {
        if (DEBUG) console.log("OverlappingModel: clear");
        super.clear();

        if (this.ground != 0) {
            for (let x = 0; x < this.FMX; x++) {
                for (let t = 0; t < this.T; t++) {
                    if (t != this.ground) {
                        this.wave[x][this.FMY - 1][t] = false;
                    }
                }
                this.changes[x][this.FMY-1] = true;

                for (let y = 0; y < this.FMY - 1; y++) {
                    this.wave[x][y][this.ground] = false;
                    this.changes[x][y] = true;
                }
            }

            while (this.propagate());
        }
    }

    getImage() {
        const result = ndarray(new Uint8Array(this.FMX * this.FMY * 3), [this.FMX, this.FMY, 3]);
        for (let y = 0; y < this.FMY; y++) {
            for (let x = 0; x < this.FMX; x++) {
                let contributors = 0, r = 0, g = 0, b = 0;
                for (let dy = 0; dy < this.N; dy++) {
                    for (let dx = 0; dx < this.N; dx++) {
                        let sx = x - dx;
                        if (sx < 0) {
                            sx += this.FMX;
                        }

                        let sy = y - dy;
                        if (sy < 0) {
                            sy += this.FMY;
                        }

                        if (this.onBoundary(sx, sy)) {
                            continue;
                        }
                        for (let t = 0; t < this.T; t++) {
                            if (this.wave[sx][sy][t]) {
                                contributors++;
                                const color = this.colors[this.patterns[t][dx + dy * this.N]];
                                r += color[0];
                                g += color[1];
                                b += color[2];
                            }
                        }
                    }
                }
                result.set(x, y, 0, r);
                result.set(x, y, 1, g);
                result.set(x, y, 2, b);
            }
        }
        return result;
    }
}

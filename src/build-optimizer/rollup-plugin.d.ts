/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
/**
 * @fileoverview This adapts the buildOptimizer to run over each file as it is
 * processed by Rollup. We must do this since buildOptimizer expects to see the
 * ESModules in the input sources, and therefore cannot run on the rollup output
 */
import { RawSourceMap } from 'source-map';
export interface Options {
    sideEffectFreeModules?: string[];
    angularCoreModules?: string[];
}
export default function optimizer(options: Options): {
    name: string;
    transform: (content: string, id: string) => {
        code: string;
        map: RawSourceMap;
    } | null;
};

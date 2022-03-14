"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCleanHelperName = exports.isHelperName = exports.hasPureComment = exports.addPureComment = exports.collectDeepNodes = void 0;
const tslib = __importStar(require("tslib"));
const ts = __importStar(require("typescript"));
const pureFunctionComment = '@__PURE__';
// We include only exports that start with '__' because tslib helpers
// all start with a suffix of two underscores.
const tslibHelpers = new Set(Object.keys(tslib).filter((h) => h.startsWith('__')));
// Find all nodes from the AST in the subtree of node of SyntaxKind kind.
function collectDeepNodes(node, kind) {
    const nodes = [];
    const helper = (child) => {
        if (child.kind === kind) {
            nodes.push(child);
        }
        ts.forEachChild(child, helper);
    };
    ts.forEachChild(node, helper);
    return nodes;
}
exports.collectDeepNodes = collectDeepNodes;
function addPureComment(node) {
    return ts.addSyntheticLeadingComment(node, ts.SyntaxKind.MultiLineCommentTrivia, pureFunctionComment, false);
}
exports.addPureComment = addPureComment;
function hasPureComment(node) {
    if (!node) {
        return false;
    }
    const leadingComment = ts.getSyntheticLeadingComments(node);
    return !!leadingComment && leadingComment.some((comment) => comment.text === pureFunctionComment);
}
exports.hasPureComment = hasPureComment;
function isHelperName(name) {
    return tslibHelpers.has(name);
}
exports.isHelperName = isHelperName;
/**
 * In FESM's when not using `importHelpers` there might be multiple in the same file.
  @example
  ```
  var __decorate$1 = '';
  var __decorate$2 = '';
  ```
 * @returns Helper name without the '$' and number suffix or `undefined` if it's not a helper.
 */
function getCleanHelperName(name) {
    const parts = name.split('$');
    const cleanName = parts[0];
    if (parts.length > 2 || (parts.length === 2 && isNaN(+parts[1]))) {
        return undefined;
    }
    return isHelperName(cleanName) ? cleanName : undefined;
}
exports.getCleanHelperName = getCleanHelperName;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXN0LXV0aWxzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYnVpbGRfb3B0aW1pemVyL3NyYy9oZWxwZXJzL2FzdC11dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILDZDQUErQjtBQUMvQiwrQ0FBaUM7QUFFakMsTUFBTSxtQkFBbUIsR0FBRyxXQUFXLENBQUM7QUFFeEMscUVBQXFFO0FBQ3JFLDhDQUE4QztBQUM5QyxNQUFNLFlBQVksR0FBRyxJQUFJLEdBQUcsQ0FBUyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFFM0YseUVBQXlFO0FBQ3pFLFNBQWdCLGdCQUFnQixDQUFvQixJQUFhLEVBQUUsSUFBbUI7SUFDcEYsTUFBTSxLQUFLLEdBQVEsRUFBRSxDQUFDO0lBQ3RCLE1BQU0sTUFBTSxHQUFHLENBQUMsS0FBYyxFQUFFLEVBQUU7UUFDaEMsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLElBQUksRUFBRTtZQUN2QixLQUFLLENBQUMsSUFBSSxDQUFDLEtBQVUsQ0FBQyxDQUFDO1NBQ3hCO1FBQ0QsRUFBRSxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDakMsQ0FBQyxDQUFDO0lBQ0YsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFFOUIsT0FBTyxLQUFLLENBQUM7QUFDZixDQUFDO0FBWEQsNENBV0M7QUFFRCxTQUFnQixjQUFjLENBQW9CLElBQU87SUFDdkQsT0FBTyxFQUFFLENBQUMsMEJBQTBCLENBQ2xDLElBQUksRUFDSixFQUFFLENBQUMsVUFBVSxDQUFDLHNCQUFzQixFQUNwQyxtQkFBbUIsRUFDbkIsS0FBSyxDQUNOLENBQUM7QUFDSixDQUFDO0FBUEQsd0NBT0M7QUFFRCxTQUFnQixjQUFjLENBQUMsSUFBYTtJQUMxQyxJQUFJLENBQUMsSUFBSSxFQUFFO1FBQ1QsT0FBTyxLQUFLLENBQUM7S0FDZDtJQUVELE1BQU0sY0FBYyxHQUFHLEVBQUUsQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUU1RCxPQUFPLENBQUMsQ0FBQyxjQUFjLElBQUksY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSyxtQkFBbUIsQ0FBQyxDQUFDO0FBQ3BHLENBQUM7QUFSRCx3Q0FRQztBQUVELFNBQWdCLFlBQVksQ0FBQyxJQUFZO0lBQ3ZDLE9BQU8sWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNoQyxDQUFDO0FBRkQsb0NBRUM7QUFFRDs7Ozs7Ozs7R0FRRztBQUNILFNBQWdCLGtCQUFrQixDQUFDLElBQVk7SUFDN0MsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUM5QixNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFM0IsSUFBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7UUFDaEUsT0FBTyxTQUFTLENBQUM7S0FDbEI7SUFFRCxPQUFPLFlBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDekQsQ0FBQztBQVRELGdEQVNDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCAqIGFzIHRzbGliIGZyb20gJ3RzbGliJztcbmltcG9ydCAqIGFzIHRzIGZyb20gJ3R5cGVzY3JpcHQnO1xuXG5jb25zdCBwdXJlRnVuY3Rpb25Db21tZW50ID0gJ0BfX1BVUkVfXyc7XG5cbi8vIFdlIGluY2x1ZGUgb25seSBleHBvcnRzIHRoYXQgc3RhcnQgd2l0aCAnX18nIGJlY2F1c2UgdHNsaWIgaGVscGVyc1xuLy8gYWxsIHN0YXJ0IHdpdGggYSBzdWZmaXggb2YgdHdvIHVuZGVyc2NvcmVzLlxuY29uc3QgdHNsaWJIZWxwZXJzID0gbmV3IFNldDxzdHJpbmc+KE9iamVjdC5rZXlzKHRzbGliKS5maWx0ZXIoKGgpID0+IGguc3RhcnRzV2l0aCgnX18nKSkpO1xuXG4vLyBGaW5kIGFsbCBub2RlcyBmcm9tIHRoZSBBU1QgaW4gdGhlIHN1YnRyZWUgb2Ygbm9kZSBvZiBTeW50YXhLaW5kIGtpbmQuXG5leHBvcnQgZnVuY3Rpb24gY29sbGVjdERlZXBOb2RlczxUIGV4dGVuZHMgdHMuTm9kZT4obm9kZTogdHMuTm9kZSwga2luZDogdHMuU3ludGF4S2luZCk6IFRbXSB7XG4gIGNvbnN0IG5vZGVzOiBUW10gPSBbXTtcbiAgY29uc3QgaGVscGVyID0gKGNoaWxkOiB0cy5Ob2RlKSA9PiB7XG4gICAgaWYgKGNoaWxkLmtpbmQgPT09IGtpbmQpIHtcbiAgICAgIG5vZGVzLnB1c2goY2hpbGQgYXMgVCk7XG4gICAgfVxuICAgIHRzLmZvckVhY2hDaGlsZChjaGlsZCwgaGVscGVyKTtcbiAgfTtcbiAgdHMuZm9yRWFjaENoaWxkKG5vZGUsIGhlbHBlcik7XG5cbiAgcmV0dXJuIG5vZGVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkUHVyZUNvbW1lbnQ8VCBleHRlbmRzIHRzLk5vZGU+KG5vZGU6IFQpOiBUIHtcbiAgcmV0dXJuIHRzLmFkZFN5bnRoZXRpY0xlYWRpbmdDb21tZW50KFxuICAgIG5vZGUsXG4gICAgdHMuU3ludGF4S2luZC5NdWx0aUxpbmVDb21tZW50VHJpdmlhLFxuICAgIHB1cmVGdW5jdGlvbkNvbW1lbnQsXG4gICAgZmFsc2UsXG4gICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNQdXJlQ29tbWVudChub2RlOiB0cy5Ob2RlKTogYm9vbGVhbiB7XG4gIGlmICghbm9kZSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IGxlYWRpbmdDb21tZW50ID0gdHMuZ2V0U3ludGhldGljTGVhZGluZ0NvbW1lbnRzKG5vZGUpO1xuXG4gIHJldHVybiAhIWxlYWRpbmdDb21tZW50ICYmIGxlYWRpbmdDb21tZW50LnNvbWUoKGNvbW1lbnQpID0+IGNvbW1lbnQudGV4dCA9PT0gcHVyZUZ1bmN0aW9uQ29tbWVudCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0hlbHBlck5hbWUobmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiB0c2xpYkhlbHBlcnMuaGFzKG5hbWUpO1xufVxuXG4vKipcbiAqIEluIEZFU00ncyB3aGVuIG5vdCB1c2luZyBgaW1wb3J0SGVscGVyc2AgdGhlcmUgbWlnaHQgYmUgbXVsdGlwbGUgaW4gdGhlIHNhbWUgZmlsZS5cbiAgQGV4YW1wbGVcbiAgYGBgXG4gIHZhciBfX2RlY29yYXRlJDEgPSAnJztcbiAgdmFyIF9fZGVjb3JhdGUkMiA9ICcnO1xuICBgYGBcbiAqIEByZXR1cm5zIEhlbHBlciBuYW1lIHdpdGhvdXQgdGhlICckJyBhbmQgbnVtYmVyIHN1ZmZpeCBvciBgdW5kZWZpbmVkYCBpZiBpdCdzIG5vdCBhIGhlbHBlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldENsZWFuSGVscGVyTmFtZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICBjb25zdCBwYXJ0cyA9IG5hbWUuc3BsaXQoJyQnKTtcbiAgY29uc3QgY2xlYW5OYW1lID0gcGFydHNbMF07XG5cbiAgaWYgKHBhcnRzLmxlbmd0aCA+IDIgfHwgKHBhcnRzLmxlbmd0aCA9PT0gMiAmJiBpc05hTigrcGFydHNbMV0pKSkge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cblxuICByZXR1cm4gaXNIZWxwZXJOYW1lKGNsZWFuTmFtZSkgPyBjbGVhbk5hbWUgOiB1bmRlZmluZWQ7XG59XG4iXX0=
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
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
exports.findTopLevelFunctions = exports.getPrefixFunctionsTransformer = void 0;
const ts = __importStar(require("typescript"));
const ast_utils_1 = require("../helpers/ast-utils");
function getPrefixFunctionsTransformer() {
    return (context) => {
        const transformer = (sf) => {
            const topLevelFunctions = findTopLevelFunctions(sf);
            const visitor = (node) => {
                // Add pure function comment to top level functions.
                if (topLevelFunctions.has(node)) {
                    const newNode = (0, ast_utils_1.addPureComment)(node);
                    // Replace node with modified one.
                    return ts.visitEachChild(newNode, visitor, context);
                }
                // Otherwise return node as is.
                return ts.visitEachChild(node, visitor, context);
            };
            return ts.visitNode(sf, visitor);
        };
        return transformer;
    };
}
exports.getPrefixFunctionsTransformer = getPrefixFunctionsTransformer;
function findTopLevelFunctions(parentNode) {
    const topLevelFunctions = new Set();
    function cb(node) {
        // Stop recursing into this branch if it's a definition construct.
        // These are function expression, function declaration, class, or arrow function (lambda).
        // The body of these constructs will not execute when loading the module, so we don't
        // need to mark function calls inside them as pure.
        // Class static initializers in ES2015 are an exception we don't cover. They would need similar
        // processing as enums to prevent property setting from causing the class to be retained.
        if (ts.isFunctionLike(node) ||
            ts.isClassLike(node) ||
            ts.isArrowFunction(node) ||
            ts.isMethodDeclaration(node)) {
            return;
        }
        let noPureComment = !(0, ast_utils_1.hasPureComment)(node);
        let innerNode = node;
        while (innerNode && ts.isParenthesizedExpression(innerNode)) {
            innerNode = innerNode.expression;
            noPureComment = noPureComment && !(0, ast_utils_1.hasPureComment)(innerNode);
        }
        if (!innerNode) {
            return;
        }
        if ((ts.isFunctionExpression(innerNode) || ts.isArrowFunction(innerNode)) &&
            ts.isParenthesizedExpression(node)) {
            // pure functions can be wrapped in parentizes
            // we should not add pure comments to this sort of syntax.
            // example var foo = (() => x)
            return;
        }
        if (noPureComment) {
            if (ts.isNewExpression(innerNode)) {
                topLevelFunctions.add(node);
            }
            else if (ts.isCallExpression(innerNode)) {
                let expression = innerNode.expression;
                if (ts.isIdentifier(expression) && (0, ast_utils_1.getCleanHelperName)(expression.text)) {
                    return;
                }
                while (expression && ts.isParenthesizedExpression(expression)) {
                    expression = expression.expression;
                }
                if (expression) {
                    if (ts.isFunctionExpression(expression)) {
                        // Skip IIFE's with arguments
                        // This could be improved to check if there are any references to variables
                        if (innerNode.arguments.length === 0) {
                            topLevelFunctions.add(node);
                        }
                    }
                    else {
                        topLevelFunctions.add(node);
                    }
                }
            }
        }
        ts.forEachChild(innerNode, cb);
    }
    ts.forEachChild(parentNode, cb);
    return topLevelFunctions;
}
exports.findTopLevelFunctions = findTopLevelFunctions;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZml4LWZ1bmN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2J1aWxkX29wdGltaXplci9zcmMvdHJhbnNmb3Jtcy9wcmVmaXgtZnVuY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCwrQ0FBaUM7QUFDakMsb0RBQTBGO0FBRTFGLFNBQWdCLDZCQUE2QjtJQUMzQyxPQUFPLENBQUMsT0FBaUMsRUFBaUMsRUFBRTtRQUMxRSxNQUFNLFdBQVcsR0FBa0MsQ0FBQyxFQUFpQixFQUFFLEVBQUU7WUFDdkUsTUFBTSxpQkFBaUIsR0FBRyxxQkFBcUIsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUVwRCxNQUFNLE9BQU8sR0FBZSxDQUFDLElBQWEsRUFBVyxFQUFFO2dCQUNyRCxvREFBb0Q7Z0JBQ3BELElBQUksaUJBQWlCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFO29CQUMvQixNQUFNLE9BQU8sR0FBRyxJQUFBLDBCQUFjLEVBQUMsSUFBSSxDQUFDLENBQUM7b0JBRXJDLGtDQUFrQztvQkFDbEMsT0FBTyxFQUFFLENBQUMsY0FBYyxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7aUJBQ3JEO2dCQUVELCtCQUErQjtnQkFDL0IsT0FBTyxFQUFFLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDbkQsQ0FBQyxDQUFDO1lBRUYsT0FBTyxFQUFFLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUNuQyxDQUFDLENBQUM7UUFFRixPQUFPLFdBQVcsQ0FBQztJQUNyQixDQUFDLENBQUM7QUFDSixDQUFDO0FBdkJELHNFQXVCQztBQUVELFNBQWdCLHFCQUFxQixDQUFDLFVBQW1CO0lBQ3ZELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxHQUFHLEVBQVcsQ0FBQztJQUU3QyxTQUFTLEVBQUUsQ0FBQyxJQUFhO1FBQ3ZCLGtFQUFrRTtRQUNsRSwwRkFBMEY7UUFDMUYscUZBQXFGO1FBQ3JGLG1EQUFtRDtRQUNuRCwrRkFBK0Y7UUFDL0YseUZBQXlGO1FBQ3pGLElBQ0UsRUFBRSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUM7WUFDdkIsRUFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUM7WUFDcEIsRUFBRSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUM7WUFDeEIsRUFBRSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxFQUM1QjtZQUNBLE9BQU87U0FDUjtRQUVELElBQUksYUFBYSxHQUFHLENBQUMsSUFBQSwwQkFBYyxFQUFDLElBQUksQ0FBQyxDQUFDO1FBQzFDLElBQUksU0FBUyxHQUFHLElBQUksQ0FBQztRQUNyQixPQUFPLFNBQVMsSUFBSSxFQUFFLENBQUMseUJBQXlCLENBQUMsU0FBUyxDQUFDLEVBQUU7WUFDM0QsU0FBUyxHQUFHLFNBQVMsQ0FBQyxVQUFVLENBQUM7WUFDakMsYUFBYSxHQUFHLGFBQWEsSUFBSSxDQUFDLElBQUEsMEJBQWMsRUFBQyxTQUFTLENBQUMsQ0FBQztTQUM3RDtRQUVELElBQUksQ0FBQyxTQUFTLEVBQUU7WUFDZCxPQUFPO1NBQ1I7UUFFRCxJQUNFLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDckUsRUFBRSxDQUFDLHlCQUF5QixDQUFDLElBQUksQ0FBQyxFQUNsQztZQUNBLDhDQUE4QztZQUM5QywwREFBMEQ7WUFDMUQsOEJBQThCO1lBQzlCLE9BQU87U0FDUjtRQUVELElBQUksYUFBYSxFQUFFO1lBQ2pCLElBQUksRUFBRSxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsRUFBRTtnQkFDakMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQzdCO2lCQUFNLElBQUksRUFBRSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxFQUFFO2dCQUN6QyxJQUFJLFVBQVUsR0FBa0IsU0FBUyxDQUFDLFVBQVUsQ0FBQztnQkFFckQsSUFBSSxFQUFFLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxJQUFJLElBQUEsOEJBQWtCLEVBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxFQUFFO29CQUN0RSxPQUFPO2lCQUNSO2dCQUVELE9BQU8sVUFBVSxJQUFJLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxVQUFVLENBQUMsRUFBRTtvQkFDN0QsVUFBVSxHQUFHLFVBQVUsQ0FBQyxVQUFVLENBQUM7aUJBQ3BDO2dCQUVELElBQUksVUFBVSxFQUFFO29CQUNkLElBQUksRUFBRSxDQUFDLG9CQUFvQixDQUFDLFVBQVUsQ0FBQyxFQUFFO3dCQUN2Qyw2QkFBNkI7d0JBQzdCLDJFQUEyRTt3QkFDM0UsSUFBSSxTQUFTLENBQUMsU0FBUyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7NEJBQ3BDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQzt5QkFDN0I7cUJBQ0Y7eUJBQU07d0JBQ0wsaUJBQWlCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO3FCQUM3QjtpQkFDRjthQUNGO1NBQ0Y7UUFFRCxFQUFFLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNqQyxDQUFDO0lBRUQsRUFBRSxDQUFDLFlBQVksQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFFaEMsT0FBTyxpQkFBaUIsQ0FBQztBQUMzQixDQUFDO0FBMUVELHNEQTBFQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgKiBhcyB0cyBmcm9tICd0eXBlc2NyaXB0JztcbmltcG9ydCB7IGFkZFB1cmVDb21tZW50LCBnZXRDbGVhbkhlbHBlck5hbWUsIGhhc1B1cmVDb21tZW50IH0gZnJvbSAnLi4vaGVscGVycy9hc3QtdXRpbHMnO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UHJlZml4RnVuY3Rpb25zVHJhbnNmb3JtZXIoKTogdHMuVHJhbnNmb3JtZXJGYWN0b3J5PHRzLlNvdXJjZUZpbGU+IHtcbiAgcmV0dXJuIChjb250ZXh0OiB0cy5UcmFuc2Zvcm1hdGlvbkNvbnRleHQpOiB0cy5UcmFuc2Zvcm1lcjx0cy5Tb3VyY2VGaWxlPiA9PiB7XG4gICAgY29uc3QgdHJhbnNmb3JtZXI6IHRzLlRyYW5zZm9ybWVyPHRzLlNvdXJjZUZpbGU+ID0gKHNmOiB0cy5Tb3VyY2VGaWxlKSA9PiB7XG4gICAgICBjb25zdCB0b3BMZXZlbEZ1bmN0aW9ucyA9IGZpbmRUb3BMZXZlbEZ1bmN0aW9ucyhzZik7XG5cbiAgICAgIGNvbnN0IHZpc2l0b3I6IHRzLlZpc2l0b3IgPSAobm9kZTogdHMuTm9kZSk6IHRzLk5vZGUgPT4ge1xuICAgICAgICAvLyBBZGQgcHVyZSBmdW5jdGlvbiBjb21tZW50IHRvIHRvcCBsZXZlbCBmdW5jdGlvbnMuXG4gICAgICAgIGlmICh0b3BMZXZlbEZ1bmN0aW9ucy5oYXMobm9kZSkpIHtcbiAgICAgICAgICBjb25zdCBuZXdOb2RlID0gYWRkUHVyZUNvbW1lbnQobm9kZSk7XG5cbiAgICAgICAgICAvLyBSZXBsYWNlIG5vZGUgd2l0aCBtb2RpZmllZCBvbmUuXG4gICAgICAgICAgcmV0dXJuIHRzLnZpc2l0RWFjaENoaWxkKG5ld05vZGUsIHZpc2l0b3IsIGNvbnRleHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gT3RoZXJ3aXNlIHJldHVybiBub2RlIGFzIGlzLlxuICAgICAgICByZXR1cm4gdHMudmlzaXRFYWNoQ2hpbGQobm9kZSwgdmlzaXRvciwgY29udGV4dCk7XG4gICAgICB9O1xuXG4gICAgICByZXR1cm4gdHMudmlzaXROb2RlKHNmLCB2aXNpdG9yKTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRyYW5zZm9ybWVyO1xuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZFRvcExldmVsRnVuY3Rpb25zKHBhcmVudE5vZGU6IHRzLk5vZGUpOiBTZXQ8dHMuTm9kZT4ge1xuICBjb25zdCB0b3BMZXZlbEZ1bmN0aW9ucyA9IG5ldyBTZXQ8dHMuTm9kZT4oKTtcblxuICBmdW5jdGlvbiBjYihub2RlOiB0cy5Ob2RlKSB7XG4gICAgLy8gU3RvcCByZWN1cnNpbmcgaW50byB0aGlzIGJyYW5jaCBpZiBpdCdzIGEgZGVmaW5pdGlvbiBjb25zdHJ1Y3QuXG4gICAgLy8gVGhlc2UgYXJlIGZ1bmN0aW9uIGV4cHJlc3Npb24sIGZ1bmN0aW9uIGRlY2xhcmF0aW9uLCBjbGFzcywgb3IgYXJyb3cgZnVuY3Rpb24gKGxhbWJkYSkuXG4gICAgLy8gVGhlIGJvZHkgb2YgdGhlc2UgY29uc3RydWN0cyB3aWxsIG5vdCBleGVjdXRlIHdoZW4gbG9hZGluZyB0aGUgbW9kdWxlLCBzbyB3ZSBkb24ndFxuICAgIC8vIG5lZWQgdG8gbWFyayBmdW5jdGlvbiBjYWxscyBpbnNpZGUgdGhlbSBhcyBwdXJlLlxuICAgIC8vIENsYXNzIHN0YXRpYyBpbml0aWFsaXplcnMgaW4gRVMyMDE1IGFyZSBhbiBleGNlcHRpb24gd2UgZG9uJ3QgY292ZXIuIFRoZXkgd291bGQgbmVlZCBzaW1pbGFyXG4gICAgLy8gcHJvY2Vzc2luZyBhcyBlbnVtcyB0byBwcmV2ZW50IHByb3BlcnR5IHNldHRpbmcgZnJvbSBjYXVzaW5nIHRoZSBjbGFzcyB0byBiZSByZXRhaW5lZC5cbiAgICBpZiAoXG4gICAgICB0cy5pc0Z1bmN0aW9uTGlrZShub2RlKSB8fFxuICAgICAgdHMuaXNDbGFzc0xpa2Uobm9kZSkgfHxcbiAgICAgIHRzLmlzQXJyb3dGdW5jdGlvbihub2RlKSB8fFxuICAgICAgdHMuaXNNZXRob2REZWNsYXJhdGlvbihub2RlKVxuICAgICkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBub1B1cmVDb21tZW50ID0gIWhhc1B1cmVDb21tZW50KG5vZGUpO1xuICAgIGxldCBpbm5lck5vZGUgPSBub2RlO1xuICAgIHdoaWxlIChpbm5lck5vZGUgJiYgdHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihpbm5lck5vZGUpKSB7XG4gICAgICBpbm5lck5vZGUgPSBpbm5lck5vZGUuZXhwcmVzc2lvbjtcbiAgICAgIG5vUHVyZUNvbW1lbnQgPSBub1B1cmVDb21tZW50ICYmICFoYXNQdXJlQ29tbWVudChpbm5lck5vZGUpO1xuICAgIH1cblxuICAgIGlmICghaW5uZXJOb2RlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgKHRzLmlzRnVuY3Rpb25FeHByZXNzaW9uKGlubmVyTm9kZSkgfHwgdHMuaXNBcnJvd0Z1bmN0aW9uKGlubmVyTm9kZSkpICYmXG4gICAgICB0cy5pc1BhcmVudGhlc2l6ZWRFeHByZXNzaW9uKG5vZGUpXG4gICAgKSB7XG4gICAgICAvLyBwdXJlIGZ1bmN0aW9ucyBjYW4gYmUgd3JhcHBlZCBpbiBwYXJlbnRpemVzXG4gICAgICAvLyB3ZSBzaG91bGQgbm90IGFkZCBwdXJlIGNvbW1lbnRzIHRvIHRoaXMgc29ydCBvZiBzeW50YXguXG4gICAgICAvLyBleGFtcGxlIHZhciBmb28gPSAoKCkgPT4geClcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAobm9QdXJlQ29tbWVudCkge1xuICAgICAgaWYgKHRzLmlzTmV3RXhwcmVzc2lvbihpbm5lck5vZGUpKSB7XG4gICAgICAgIHRvcExldmVsRnVuY3Rpb25zLmFkZChub2RlKTtcbiAgICAgIH0gZWxzZSBpZiAodHMuaXNDYWxsRXhwcmVzc2lvbihpbm5lck5vZGUpKSB7XG4gICAgICAgIGxldCBleHByZXNzaW9uOiB0cy5FeHByZXNzaW9uID0gaW5uZXJOb2RlLmV4cHJlc3Npb247XG5cbiAgICAgICAgaWYgKHRzLmlzSWRlbnRpZmllcihleHByZXNzaW9uKSAmJiBnZXRDbGVhbkhlbHBlck5hbWUoZXhwcmVzc2lvbi50ZXh0KSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHdoaWxlIChleHByZXNzaW9uICYmIHRzLmlzUGFyZW50aGVzaXplZEV4cHJlc3Npb24oZXhwcmVzc2lvbikpIHtcbiAgICAgICAgICBleHByZXNzaW9uID0gZXhwcmVzc2lvbi5leHByZXNzaW9uO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGV4cHJlc3Npb24pIHtcbiAgICAgICAgICBpZiAodHMuaXNGdW5jdGlvbkV4cHJlc3Npb24oZXhwcmVzc2lvbikpIHtcbiAgICAgICAgICAgIC8vIFNraXAgSUlGRSdzIHdpdGggYXJndW1lbnRzXG4gICAgICAgICAgICAvLyBUaGlzIGNvdWxkIGJlIGltcHJvdmVkIHRvIGNoZWNrIGlmIHRoZXJlIGFyZSBhbnkgcmVmZXJlbmNlcyB0byB2YXJpYWJsZXNcbiAgICAgICAgICAgIGlmIChpbm5lck5vZGUuYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICB0b3BMZXZlbEZ1bmN0aW9ucy5hZGQobm9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRvcExldmVsRnVuY3Rpb25zLmFkZChub2RlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICB0cy5mb3JFYWNoQ2hpbGQoaW5uZXJOb2RlLCBjYik7XG4gIH1cblxuICB0cy5mb3JFYWNoQ2hpbGQocGFyZW50Tm9kZSwgY2IpO1xuXG4gIHJldHVybiB0b3BMZXZlbEZ1bmN0aW9ucztcbn1cbiJdfQ==
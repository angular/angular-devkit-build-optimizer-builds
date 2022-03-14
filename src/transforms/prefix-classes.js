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
exports.getPrefixClassesTransformer = exports.testPrefixClasses = void 0;
const ts = __importStar(require("typescript"));
const ast_utils_1 = require("../helpers/ast-utils");
function testPrefixClasses(content) {
    const exportVarSetter = /(?:export )?(?:var|const)\s+(?:\S+)\s*=\s*/;
    const multiLineComment = /\s*(?:\/\*[\s\S]*?\*\/)?\s*/;
    const newLine = /\s*\r?\n\s*/;
    const regexes = [
        [
            /^/,
            exportVarSetter,
            multiLineComment,
            /\(/,
            multiLineComment,
            /\s*function \(\) {/,
            newLine,
            multiLineComment,
            /function (?:\S+)\([^)]*\) \{/,
            newLine,
        ],
        [
            /^/,
            exportVarSetter,
            multiLineComment,
            /\(/,
            multiLineComment,
            /\s*function \(_super\) {/,
            newLine,
            /\S*\.?__extends\(\S+, _super\);/,
        ],
    ].map((arr) => new RegExp(arr.map((x) => x.source).join(''), 'm'));
    return regexes.some((regex) => regex.test(content));
}
exports.testPrefixClasses = testPrefixClasses;
const superParameterName = '_super';
const extendsHelperName = '__extends';
function getPrefixClassesTransformer() {
    return (context) => {
        const transformer = (sf) => {
            const visitor = (node) => {
                // Add pure comment to downleveled classes.
                if (ts.isVariableStatement(node) && isDownleveledClass(node)) {
                    const varDecl = node.declarationList.declarations[0];
                    const varInitializer = varDecl.initializer;
                    // Update node with the pure comment before the variable declaration initializer.
                    const newNode = ts.updateVariableStatement(node, node.modifiers, ts.updateVariableDeclarationList(node.declarationList, [
                        ts.updateVariableDeclaration(varDecl, varDecl.name, varDecl.type, (0, ast_utils_1.addPureComment)(varInitializer)),
                    ]));
                    // Replace node with modified one.
                    return ts.visitEachChild(newNode, visitor, context);
                }
                // Otherwise return node as is.
                return ts.visitEachChild(node, visitor, context);
            };
            return ts.visitEachChild(sf, visitor, context);
        };
        return transformer;
    };
}
exports.getPrefixClassesTransformer = getPrefixClassesTransformer;
// Determine if a node matched the structure of a downleveled TS class.
function isDownleveledClass(node) {
    if (!ts.isVariableStatement(node)) {
        return false;
    }
    if (node.declarationList.declarations.length !== 1) {
        return false;
    }
    const variableDeclaration = node.declarationList.declarations[0];
    if (!ts.isIdentifier(variableDeclaration.name) || !variableDeclaration.initializer) {
        return false;
    }
    let potentialClass = variableDeclaration.initializer;
    // TS 2.3 has an unwrapped class IIFE
    // TS 2.4 uses a function expression wrapper
    // TS 2.5 uses an arrow function wrapper
    if (ts.isParenthesizedExpression(potentialClass)) {
        potentialClass = potentialClass.expression;
    }
    if (!ts.isCallExpression(potentialClass) || potentialClass.arguments.length > 1) {
        return false;
    }
    let wrapperBody;
    if (ts.isFunctionExpression(potentialClass.expression)) {
        wrapperBody = potentialClass.expression.body;
    }
    else if (ts.isArrowFunction(potentialClass.expression) &&
        ts.isBlock(potentialClass.expression.body)) {
        wrapperBody = potentialClass.expression.body;
    }
    else {
        return false;
    }
    if (wrapperBody.statements.length === 0) {
        return false;
    }
    const functionExpression = potentialClass.expression;
    const functionStatements = wrapperBody.statements;
    // need a minimum of two for a function declaration and return statement
    if (functionStatements.length < 2) {
        return false;
    }
    const firstStatement = functionStatements[0];
    // find return statement - may not be last statement
    let returnStatement;
    for (let i = functionStatements.length - 1; i > 0; i--) {
        if (ts.isReturnStatement(functionStatements[i])) {
            returnStatement = functionStatements[i];
            break;
        }
    }
    if (returnStatement == undefined ||
        returnStatement.expression == undefined ||
        !ts.isIdentifier(returnStatement.expression)) {
        return false;
    }
    if (functionExpression.parameters.length === 0) {
        // potential non-extended class or wrapped es2015 class
        return ((ts.isFunctionDeclaration(firstStatement) || ts.isClassDeclaration(firstStatement)) &&
            firstStatement.name !== undefined &&
            returnStatement.expression.text === firstStatement.name.text);
    }
    else if (functionExpression.parameters.length !== 1) {
        return false;
    }
    // Potential extended class
    const functionParameter = functionExpression.parameters[0];
    if (!ts.isIdentifier(functionParameter.name) ||
        functionParameter.name.text !== superParameterName) {
        return false;
    }
    if (functionStatements.length < 3 || !ts.isExpressionStatement(firstStatement)) {
        return false;
    }
    if (!ts.isCallExpression(firstStatement.expression)) {
        return false;
    }
    const extendCallExpression = firstStatement.expression;
    let functionName;
    if (ts.isIdentifier(extendCallExpression.expression)) {
        functionName = extendCallExpression.expression.text;
    }
    else if (ts.isPropertyAccessExpression(extendCallExpression.expression)) {
        functionName = extendCallExpression.expression.name.text;
    }
    if (!functionName || !functionName.endsWith(extendsHelperName)) {
        return false;
    }
    if (extendCallExpression.arguments.length === 0) {
        return false;
    }
    const lastArgument = extendCallExpression.arguments[extendCallExpression.arguments.length - 1];
    if (!ts.isIdentifier(lastArgument) || lastArgument.text !== functionParameter.name.text) {
        return false;
    }
    const secondStatement = functionStatements[1];
    return (ts.isFunctionDeclaration(secondStatement) &&
        secondStatement.name !== undefined &&
        returnStatement.expression.text === secondStatement.name.text);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZml4LWNsYXNzZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyX2RldmtpdC9idWlsZF9vcHRpbWl6ZXIvc3JjL3RyYW5zZm9ybXMvcHJlZml4LWNsYXNzZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCwrQ0FBaUM7QUFDakMsb0RBQXNEO0FBRXRELFNBQWdCLGlCQUFpQixDQUFDLE9BQWU7SUFDL0MsTUFBTSxlQUFlLEdBQUcsNENBQTRDLENBQUM7SUFDckUsTUFBTSxnQkFBZ0IsR0FBRyw2QkFBNkIsQ0FBQztJQUN2RCxNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUM7SUFFOUIsTUFBTSxPQUFPLEdBQUc7UUFDZDtZQUNFLEdBQUc7WUFDSCxlQUFlO1lBQ2YsZ0JBQWdCO1lBQ2hCLElBQUk7WUFDSixnQkFBZ0I7WUFDaEIsb0JBQW9CO1lBQ3BCLE9BQU87WUFDUCxnQkFBZ0I7WUFDaEIsOEJBQThCO1lBQzlCLE9BQU87U0FDUjtRQUNEO1lBQ0UsR0FBRztZQUNILGVBQWU7WUFDZixnQkFBZ0I7WUFDaEIsSUFBSTtZQUNKLGdCQUFnQjtZQUNoQiwwQkFBMEI7WUFDMUIsT0FBTztZQUNQLGlDQUFpQztTQUNsQztLQUNGLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFFbkUsT0FBTyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENB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QyxVQUFVLENBQUMsSUFBSSxDQUFDO0tBQ3JEO1NBQU0sSUFBSSxFQUFFLENBQUMsMEJBQTBCLENBQUMsb0JBQW9CLENBQUMsVUFBVSxDQUFDLEVBQUU7UUFDekUsWUFBWSxHQUFHLG9CQUFvQixDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO0tBQzFEO0lBRUQsSUFBSSxDQUFDLFlBQVksSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUMsRUFBRTtRQUM5RCxPQUFPLEtBQUssQ0FBQztLQUNkO0lBRUQsSUFBSSxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtRQUMvQyxPQUFPLEtBQUssQ0FBQztLQUNkO0lBRUQsTUFBTSxZQUFZLEdBQUcsb0JBQW9CLENBQUMsU0FBUyxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFFL0YsSUFBSSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLElBQUksWUFBWSxDQUFDLElBQUksS0FBSyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFO1FBQ3ZGLE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxNQUFNLGVBQWUsR0FBRyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUU5QyxPQUFPLENBQ0wsRUFBRSxDQUFDLHFCQUFxQixDQUFDLGVBQWUsQ0FBQztRQUN6QyxlQUFlLENBQUMsSUFBSSxLQUFLLFNBQVM7UUFDbEMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEtBQUssZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQzlELENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCAqIGFzIHRzIGZyb20gJ3R5cGVzY3JpcHQnO1xuaW1wb3J0IHsgYWRkUHVyZUNvbW1lbnQgfSBmcm9tICcuLi9oZWxwZXJzL2FzdC11dGlscyc7XG5cbmV4cG9ydCBmdW5jdGlvbiB0ZXN0UHJlZml4Q2xhc3Nlcyhjb250ZW50OiBzdHJpbmcpIHtcbiAgY29uc3QgZXhwb3J0VmFyU2V0dGVyID0gLyg/OmV4cG9ydCApPyg/OnZhcnxjb25zdClcXHMrKD86XFxTKylcXHMqPVxccyovO1xuICBjb25zdCBtdWx0aUxpbmVDb21tZW50ID0gL1xccyooPzpcXC9cXCpbXFxzXFxTXSo/XFwqXFwvKT9cXHMqLztcbiAgY29uc3QgbmV3TGluZSA9IC9cXHMqXFxyP1xcblxccyovO1xuXG4gIGNvbnN0IHJlZ2V4ZXMgPSBbXG4gICAgW1xuICAgICAgL14vLFxuICAgICAgZXhwb3J0VmFyU2V0dGVyLFxuICAgICAgbXVsdGlMaW5lQ29tbWVudCxcbiAgICAgIC9cXCgvLFxuICAgICAgbXVsdGlMaW5lQ29tbWVudCxcbiAgICAgIC9cXHMqZnVuY3Rpb24gXFwoXFwpIHsvLFxuICAgICAgbmV3TGluZSxcbiAgICAgIG11bHRpTGluZUNvbW1lbnQsXG4gICAgICAvZnVuY3Rpb24gKD86XFxTKylcXChbXildKlxcKSBcXHsvLFxuICAgICAgbmV3TGluZSxcbiAgICBdLFxuICAgIFtcbiAgICAgIC9eLyxcbiAgICAgIGV4cG9ydFZhclNldHRlcixcbiAgICAgIG11bHRpTGluZUNvbW1lbnQsXG4gICAgICAvXFwoLyxcbiAgICAgIG11bHRpTGluZUNvbW1lbnQsXG4gICAgICAvXFxzKmZ1bmN0aW9uIFxcKF9zdXBlclxcKSB7LyxcbiAgICAgIG5ld0xpbmUsXG4gICAgICAvXFxTKlxcLj9fX2V4dGVuZHNcXChcXFMrLCBfc3VwZXJcXCk7LyxcbiAgICBdLFxuICBdLm1hcCgoYXJyKSA9PiBuZXcgUmVnRXhwKGFyci5tYXAoKHgpID0+IHguc291cmNlKS5qb2luKCcnKSwgJ20nKSk7XG5cbiAgcmV0dXJuIHJlZ2V4ZXMuc29tZSgocmVnZXgpID0+IHJlZ2V4LnRlc3QoY29udGVudCkpO1xufVxuXG5jb25zdCBzdXBlclBhcmFtZXRlck5hbWUgPSAnX3N1cGVyJztcbmNvbnN0IGV4dGVuZHNIZWxwZXJOYW1lID0gJ19fZXh0ZW5kcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRQcmVmaXhDbGFzc2VzVHJhbnNmb3JtZXIoKTogdHMuVHJhbnNmb3JtZXJGYWN0b3J5PHRzLlNvdXJjZUZpbGU+IHtcbiAgcmV0dXJuIChjb250ZXh0OiB0cy5UcmFuc2Zvcm1hdGlvbkNvbnRleHQpOiB0cy5UcmFuc2Zvcm1lcjx0cy5Tb3VyY2VGaWxlPiA9PiB7XG4gICAgY29uc3QgdHJhbnNmb3JtZXI6IHRzLlRyYW5zZm9ybWVyPHRzLlNvdXJjZUZpbGU+ID0gKHNmOiB0cy5Tb3VyY2VGaWxlKSA9PiB7XG4gICAgICBjb25zdCB2aXNpdG9yOiB0cy5WaXNpdG9yID0gKG5vZGU6IHRzLk5vZGUpOiB0cy5WaXNpdFJlc3VsdDx0cy5Ob2RlPiA9PiB7XG4gICAgICAgIC8vIEFkZCBwdXJlIGNvbW1lbnQgdG8gZG93bmxldmVsZWQgY2xhc3Nlcy5cbiAgICAgICAgaWYgKHRzLmlzVmFyaWFibGVTdGF0ZW1lbnQobm9kZSkgJiYgaXNEb3dubGV2ZWxlZENsYXNzKG5vZGUpKSB7XG4gICAgICAgICAgY29uc3QgdmFyRGVjbCA9IG5vZGUuZGVjbGFyYXRpb25MaXN0LmRlY2xhcmF0aW9uc1swXTtcbiAgICAgICAgICBjb25zdCB2YXJJbml0aWFsaXplciA9IHZhckRlY2wuaW5pdGlhbGl6ZXIgYXMgdHMuRXhwcmVzc2lvbjtcblxuICAgICAgICAgIC8vIFVwZGF0ZSBub2RlIHdpdGggdGhlIHB1cmUgY29tbWVudCBiZWZvcmUgdGhlIHZhcmlhYmxlIGRlY2xhcmF0aW9uIGluaXRpYWxpemVyLlxuICAgICAgICAgIGNvbnN0IG5ld05vZGUgPSB0cy51cGRhdGVWYXJpYWJsZVN0YXRlbWVudChcbiAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICBub2RlLm1vZGlmaWVycyxcbiAgICAgICAgICAgIHRzLnVwZGF0ZVZhcmlhYmxlRGVjbGFyYXRpb25MaXN0KG5vZGUuZGVjbGFyYXRpb25MaXN0LCBbXG4gICAgICAgICAgICAgIHRzLnVwZGF0ZVZhcmlhYmxlRGVjbGFyYXRpb24oXG4gICAgICAgICAgICAgICAgdmFyRGVjbCxcbiAgICAgICAgICAgICAgICB2YXJEZWNsLm5hbWUsXG4gICAgICAgICAgICAgICAgdmFyRGVjbC50eXBlLFxuICAgICAgICAgICAgICAgIGFkZFB1cmVDb21tZW50KHZhckluaXRpYWxpemVyKSxcbiAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIF0pLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICAvLyBSZXBsYWNlIG5vZGUgd2l0aCBtb2RpZmllZCBvbmUuXG4gICAgICAgICAgcmV0dXJuIHRzLnZpc2l0RWFjaENoaWxkKG5ld05vZGUsIHZpc2l0b3IsIGNvbnRleHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gT3RoZXJ3aXNlIHJldHVybiBub2RlIGFzIGlzLlxuICAgICAgICByZXR1cm4gdHMudmlzaXRFYWNoQ2hpbGQobm9kZSwgdmlzaXRvciwgY29udGV4dCk7XG4gICAgICB9O1xuXG4gICAgICByZXR1cm4gdHMudmlzaXRFYWNoQ2hpbGQoc2YsIHZpc2l0b3IsIGNvbnRleHQpO1xuICAgIH07XG5cbiAgICByZXR1cm4gdHJhbnNmb3JtZXI7XG4gIH07XG59XG5cbi8vIERldGVybWluZSBpZiBhIG5vZGUgbWF0Y2hlZCB0aGUgc3RydWN0dXJlIG9mIGEgZG93bmxldmVsZWQgVFMgY2xhc3MuXG5mdW5jdGlvbiBpc0Rvd25sZXZlbGVkQ2xhc3Mobm9kZTogdHMuTm9kZSk6IGJvb2xlYW4ge1xuICBpZiAoIXRzLmlzVmFyaWFibGVTdGF0ZW1lbnQobm9kZSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAobm9kZS5kZWNsYXJhdGlvbkxpc3QuZGVjbGFyYXRpb25zLmxlbmd0aCAhPT0gMSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IHZhcmlhYmxlRGVjbGFyYXRpb24gPSBub2RlLmRlY2xhcmF0aW9uTGlzdC5kZWNsYXJhdGlvbnNbMF07XG5cbiAgaWYgKCF0cy5pc0lkZW50aWZpZXIodmFyaWFibGVEZWNsYXJhdGlvbi5uYW1lKSB8fCAhdmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGxldCBwb3RlbnRpYWxDbGFzcyA9IHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXI7XG5cbiAgLy8gVFMgMi4zIGhhcyBhbiB1bndyYXBwZWQgY2xhc3MgSUlGRVxuICAvLyBUUyAyLjQgdXNlcyBhIGZ1bmN0aW9uIGV4cHJlc3Npb24gd3JhcHBlclxuICAvLyBUUyAyLjUgdXNlcyBhbiBhcnJvdyBmdW5jdGlvbiB3cmFwcGVyXG4gIGlmICh0cy5pc1BhcmVudGhlc2l6ZWRFeHByZXNzaW9uKHBvdGVudGlhbENsYXNzKSkge1xuICAgIHBvdGVudGlhbENsYXNzID0gcG90ZW50aWFsQ2xhc3MuZXhwcmVzc2lvbjtcbiAgfVxuXG4gIGlmICghdHMuaXNDYWxsRXhwcmVzc2lvbihwb3RlbnRpYWxDbGFzcykgfHwgcG90ZW50aWFsQ2xhc3MuYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBsZXQgd3JhcHBlckJvZHk6IHRzLkJsb2NrO1xuICBpZiAodHMuaXNGdW5jdGlvbkV4cHJlc3Npb24ocG90ZW50aWFsQ2xhc3MuZXhwcmVzc2lvbikpIHtcbiAgICB3cmFwcGVyQm9keSA9IHBvdGVudGlhbENsYXNzLmV4cHJlc3Npb24uYm9keTtcbiAgfSBlbHNlIGlmIChcbiAgICB0cy5pc0Fycm93RnVuY3Rpb24ocG90ZW50aWFsQ2xhc3MuZXhwcmVzc2lvbikgJiZcbiAgICB0cy5pc0Jsb2NrKHBvdGVudGlhbENsYXNzLmV4cHJlc3Npb24uYm9keSlcbiAgKSB7XG4gICAgd3JhcHBlckJvZHkgPSBwb3RlbnRpYWxDbGFzcy5leHByZXNzaW9uLmJvZHk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKHdyYXBwZXJCb2R5LnN0YXRlbWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgZnVuY3Rpb25FeHByZXNzaW9uID0gcG90ZW50aWFsQ2xhc3MuZXhwcmVzc2lvbjtcbiAgY29uc3QgZnVuY3Rpb25TdGF0ZW1lbnRzID0gd3JhcHBlckJvZHkuc3RhdGVtZW50cztcblxuICAvLyBuZWVkIGEgbWluaW11bSBvZiB0d28gZm9yIGEgZnVuY3Rpb24gZGVjbGFyYXRpb24gYW5kIHJldHVybiBzdGF0ZW1lbnRcbiAgaWYgKGZ1bmN0aW9uU3RhdGVtZW50cy5sZW5ndGggPCAyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgZmlyc3RTdGF0ZW1lbnQgPSBmdW5jdGlvblN0YXRlbWVudHNbMF07XG5cbiAgLy8gZmluZCByZXR1cm4gc3RhdGVtZW50IC0gbWF5IG5vdCBiZSBsYXN0IHN0YXRlbWVudFxuICBsZXQgcmV0dXJuU3RhdGVtZW50OiB0cy5SZXR1cm5TdGF0ZW1lbnQgfCB1bmRlZmluZWQ7XG4gIGZvciAobGV0IGkgPSBmdW5jdGlvblN0YXRlbWVudHMubGVuZ3RoIC0gMTsgaSA+IDA7IGktLSkge1xuICAgIGlmICh0cy5pc1JldHVyblN0YXRlbWVudChmdW5jdGlvblN0YXRlbWVudHNbaV0pKSB7XG4gICAgICByZXR1cm5TdGF0ZW1lbnQgPSBmdW5jdGlvblN0YXRlbWVudHNbaV0gYXMgdHMuUmV0dXJuU3RhdGVtZW50O1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgaWYgKFxuICAgIHJldHVyblN0YXRlbWVudCA9PSB1bmRlZmluZWQgfHxcbiAgICByZXR1cm5TdGF0ZW1lbnQuZXhwcmVzc2lvbiA9PSB1bmRlZmluZWQgfHxcbiAgICAhdHMuaXNJZGVudGlmaWVyKHJldHVyblN0YXRlbWVudC5leHByZXNzaW9uKVxuICApIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoZnVuY3Rpb25FeHByZXNzaW9uLnBhcmFtZXRlcnMubGVuZ3RoID09PSAwKSB7XG4gICAgLy8gcG90ZW50aWFsIG5vbi1leHRlbmRlZCBjbGFzcyBvciB3cmFwcGVkIGVzMjAxNSBjbGFzc1xuICAgIHJldHVybiAoXG4gICAgICAodHMuaXNGdW5jdGlvbkRlY2xhcmF0aW9uKGZpcnN0U3RhdGVtZW50KSB8fCB0cy5pc0NsYXNzRGVjbGFyYXRpb24oZmlyc3RTdGF0ZW1lbnQpKSAmJlxuICAgICAgZmlyc3RTdGF0ZW1lbnQubmFtZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgICByZXR1cm5TdGF0ZW1lbnQuZXhwcmVzc2lvbi50ZXh0ID09PSBmaXJzdFN0YXRlbWVudC5uYW1lLnRleHRcbiAgICApO1xuICB9IGVsc2UgaWYgKGZ1bmN0aW9uRXhwcmVzc2lvbi5wYXJhbWV0ZXJzLmxlbmd0aCAhPT0gMSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIC8vIFBvdGVudGlhbCBleHRlbmRlZCBjbGFzc1xuXG4gIGNvbnN0IGZ1bmN0aW9uUGFyYW1ldGVyID0gZnVuY3Rpb25FeHByZXNzaW9uLnBhcmFtZXRlcnNbMF07XG5cbiAgaWYgKFxuICAgICF0cy5pc0lkZW50aWZpZXIoZnVuY3Rpb25QYXJhbWV0ZXIubmFtZSkgfHxcbiAgICBmdW5jdGlvblBhcmFtZXRlci5uYW1lLnRleHQgIT09IHN1cGVyUGFyYW1ldGVyTmFtZVxuICApIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoZnVuY3Rpb25TdGF0ZW1lbnRzLmxlbmd0aCA8IDMgfHwgIXRzLmlzRXhwcmVzc2lvblN0YXRlbWVudChmaXJzdFN0YXRlbWVudCkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoIXRzLmlzQ2FsbEV4cHJlc3Npb24oZmlyc3RTdGF0ZW1lbnQuZXhwcmVzc2lvbikpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBjb25zdCBleHRlbmRDYWxsRXhwcmVzc2lvbiA9IGZpcnN0U3RhdGVtZW50LmV4cHJlc3Npb247XG5cbiAgbGV0IGZ1bmN0aW9uTmFtZTtcbiAgaWYgKHRzLmlzSWRlbnRpZmllcihleHRlbmRDYWxsRXhwcmVzc2lvbi5leHByZXNzaW9uKSkge1xuICAgIGZ1bmN0aW9uTmFtZSA9IGV4dGVuZENhbGxFeHByZXNzaW9uLmV4cHJlc3Npb24udGV4dDtcbiAgfSBlbHNlIGlmICh0cy5pc1Byb3BlcnR5QWNjZXNzRXhwcmVzc2lvbihleHRlbmRDYWxsRXhwcmVzc2lvbi5leHByZXNzaW9uKSkge1xuICAgIGZ1bmN0aW9uTmFtZSA9IGV4dGVuZENhbGxFeHByZXNzaW9uLmV4cHJlc3Npb24ubmFtZS50ZXh0O1xuICB9XG5cbiAgaWYgKCFmdW5jdGlvbk5hbWUgfHwgIWZ1bmN0aW9uTmFtZS5lbmRzV2l0aChleHRlbmRzSGVscGVyTmFtZSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoZXh0ZW5kQ2FsbEV4cHJlc3Npb24uYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IGxhc3RBcmd1bWVudCA9IGV4dGVuZENhbGxFeHByZXNzaW9uLmFyZ3VtZW50c1tleHRlbmRDYWxsRXhwcmVzc2lvbi5hcmd1bWVudHMubGVuZ3RoIC0gMV07XG5cbiAgaWYgKCF0cy5pc0lkZW50aWZpZXIobGFzdEFyZ3VtZW50KSB8fCBsYXN0QXJndW1lbnQudGV4dCAhPT0gZnVuY3Rpb25QYXJhbWV0ZXIubmFtZS50ZXh0KSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3Qgc2Vjb25kU3RhdGVtZW50ID0gZnVuY3Rpb25TdGF0ZW1lbnRzWzFdO1xuXG4gIHJldHVybiAoXG4gICAgdHMuaXNGdW5jdGlvbkRlY2xhcmF0aW9uKHNlY29uZFN0YXRlbWVudCkgJiZcbiAgICBzZWNvbmRTdGF0ZW1lbnQubmFtZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgcmV0dXJuU3RhdGVtZW50LmV4cHJlc3Npb24udGV4dCA9PT0gc2Vjb25kU3RhdGVtZW50Lm5hbWUudGV4dFxuICApO1xufVxuIl19
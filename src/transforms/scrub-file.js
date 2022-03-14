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
exports.expect = exports.createScrubFileTransformerFactory = exports.testScrubFile = void 0;
const ts = __importStar(require("typescript"));
const ast_utils_1 = require("../helpers/ast-utils");
function testScrubFile(content) {
    const markers = [
        'decorators',
        '__decorate',
        'propDecorators',
        'ctorParameters',
        'ɵsetClassMetadata',
    ];
    return markers.some((marker) => content.includes(marker));
}
exports.testScrubFile = testScrubFile;
function createScrubFileTransformerFactory(isAngularCoreFile) {
    return (program) => scrubFileTransformer(program, isAngularCoreFile);
}
exports.createScrubFileTransformerFactory = createScrubFileTransformerFactory;
function scrubFileTransformer(program, isAngularCoreFile) {
    if (!program) {
        throw new Error('scrubFileTransformer requires a TypeScript Program.');
    }
    const checker = program.getTypeChecker();
    return (context) => {
        const transformer = (sf) => {
            const ngMetadata = findAngularMetadata(sf, isAngularCoreFile);
            const tslibImports = findTslibImports(sf);
            const nodes = [];
            ts.forEachChild(sf, checkNodeForDecorators);
            function checkNodeForDecorators(node) {
                var _a;
                if (!ts.isExpressionStatement(node)) {
                    return ts.forEachChild(node, checkNodeForDecorators);
                }
                const exprStmt = node;
                const iife = (_a = getIifeStatement(exprStmt)) === null || _a === void 0 ? void 0 : _a.expression;
                // Do checks that don't need the typechecker first and bail early.
                if (isCtorParamsAssignmentExpression(exprStmt)) {
                    nodes.push(node);
                }
                else if (iife && isIvyPrivateCallExpression(iife, 'ɵsetClassMetadata')) {
                    nodes.push(node);
                }
                else if (iife &&
                    ts.isBinaryExpression(iife) &&
                    isIvyPrivateCallExpression(iife.right, 'ɵsetClassMetadata')) {
                    nodes.push(node);
                }
                else if (isDecoratorAssignmentExpression(exprStmt)) {
                    nodes.push(...pickDecorationNodesToRemove(exprStmt, ngMetadata, checker));
                }
                else if (isDecorateAssignmentExpression(exprStmt, tslibImports, checker) ||
                    isAngularDecoratorExpression(exprStmt, ngMetadata, tslibImports, checker)) {
                    nodes.push(...pickDecorateNodesToRemove(exprStmt, tslibImports, ngMetadata, checker));
                }
                else if (isPropDecoratorAssignmentExpression(exprStmt)) {
                    nodes.push(...pickPropDecorationNodesToRemove(exprStmt, ngMetadata, checker));
                }
            }
            const visitor = (node) => {
                // Check if node is a statement to be dropped.
                if (nodes.find((n) => n === node)) {
                    return undefined;
                }
                // Otherwise return node as is.
                return ts.visitEachChild(node, visitor, context);
            };
            return ts.visitNode(sf, visitor);
        };
        return transformer;
    };
}
function expect(node, kind) {
    if (node.kind !== kind) {
        throw new Error('Invalid node type.');
    }
    return node;
}
exports.expect = expect;
function findAngularMetadata(node, isAngularCoreFile) {
    let specs = [];
    // Find all specifiers from imports of `@angular/core`.
    ts.forEachChild(node, (child) => {
        if (child.kind === ts.SyntaxKind.ImportDeclaration) {
            const importDecl = child;
            if (isAngularCoreImport(importDecl, isAngularCoreFile)) {
                specs.push(...(0, ast_utils_1.collectDeepNodes)(importDecl, ts.SyntaxKind.ImportSpecifier));
            }
        }
    });
    // If the current module is a Angular core file, we also consider all declarations in it to
    // potentially be Angular metadata.
    if (isAngularCoreFile) {
        const localDecl = findAllDeclarations(node);
        specs = specs.concat(localDecl);
    }
    return specs;
}
function findAllDeclarations(node) {
    const nodes = [];
    ts.forEachChild(node, (child) => {
        if (child.kind === ts.SyntaxKind.VariableStatement) {
            const vStmt = child;
            vStmt.declarationList.declarations.forEach((decl) => {
                if (decl.name.kind !== ts.SyntaxKind.Identifier) {
                    return;
                }
                nodes.push(decl);
            });
        }
    });
    return nodes;
}
function isAngularCoreImport(node, isAngularCoreFile) {
    if (!(node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))) {
        return false;
    }
    const importText = node.moduleSpecifier.text;
    // Imports to `@angular/core` are always core imports.
    if (importText === '@angular/core') {
        return true;
    }
    // Relative imports from a Angular core file are also core imports.
    if (isAngularCoreFile && importText.startsWith('.')) {
        return true;
    }
    return false;
}
// Check if assignment is `Clazz.decorators = [...];`.
function isDecoratorAssignmentExpression(exprStmt) {
    if (!isAssignmentExpressionTo(exprStmt, 'decorators')) {
        return false;
    }
    const expr = exprStmt.expression;
    if (!ts.isArrayLiteralExpression(expr.right)) {
        return false;
    }
    return true;
}
// Check if assignment is `Clazz = __decorate([...], Clazz)`.
function isDecorateAssignmentExpression(exprStmt, tslibImports, checker) {
    if (!ts.isBinaryExpression(exprStmt.expression)) {
        return false;
    }
    const expr = exprStmt.expression;
    if (!ts.isIdentifier(expr.left)) {
        return false;
    }
    const classIdent = expr.left;
    let callExpr;
    if (ts.isCallExpression(expr.right)) {
        callExpr = expr.right;
    }
    else if (ts.isBinaryExpression(expr.right)) {
        // `Clazz = Clazz_1 = __decorate([...], Clazz)` can be found when there are static property
        // accesses.
        const innerExpr = expr.right;
        if (!ts.isIdentifier(innerExpr.left) || !ts.isCallExpression(innerExpr.right)) {
            return false;
        }
        callExpr = innerExpr.right;
    }
    else {
        return false;
    }
    if (!isTslibHelper(callExpr, '__decorate', tslibImports, checker)) {
        return false;
    }
    if (callExpr.arguments.length !== 2) {
        return false;
    }
    const classArg = callExpr.arguments[1];
    if (!ts.isIdentifier(classArg)) {
        return false;
    }
    if (classIdent.text !== classArg.text) {
        return false;
    }
    if (!ts.isArrayLiteralExpression(callExpr.arguments[0])) {
        return false;
    }
    return true;
}
// Check if expression is `__decorate([smt, __metadata("design:type", Object)], ...)`.
function isAngularDecoratorExpression(exprStmt, ngMetadata, tslibImports, checker) {
    if (!ts.isCallExpression(exprStmt.expression)) {
        return false;
    }
    const callExpr = exprStmt.expression;
    if (!isTslibHelper(callExpr, '__decorate', tslibImports, checker)) {
        return false;
    }
    if (callExpr.arguments.length !== 4) {
        return false;
    }
    const decorateArray = callExpr.arguments[0];
    if (!ts.isArrayLiteralExpression(decorateArray)) {
        return false;
    }
    // Check first array entry for Angular decorators.
    if (decorateArray.elements.length === 0 || !ts.isCallExpression(decorateArray.elements[0])) {
        return false;
    }
    return decorateArray.elements.some((decoratorCall) => {
        if (!ts.isCallExpression(decoratorCall) || !ts.isIdentifier(decoratorCall.expression)) {
            return false;
        }
        const decoratorId = decoratorCall.expression;
        return identifierIsMetadata(decoratorId, ngMetadata, checker);
    });
}
// Check if assignment is `Clazz.propDecorators = [...];`.
function isPropDecoratorAssignmentExpression(exprStmt) {
    if (!isAssignmentExpressionTo(exprStmt, 'propDecorators')) {
        return false;
    }
    const expr = exprStmt.expression;
    if (expr.right.kind !== ts.SyntaxKind.ObjectLiteralExpression) {
        return false;
    }
    return true;
}
// Check if assignment is `Clazz.ctorParameters = [...];`.
function isCtorParamsAssignmentExpression(exprStmt) {
    if (!isAssignmentExpressionTo(exprStmt, 'ctorParameters')) {
        return false;
    }
    const expr = exprStmt.expression;
    if (expr.right.kind !== ts.SyntaxKind.FunctionExpression &&
        expr.right.kind !== ts.SyntaxKind.ArrowFunction) {
        return false;
    }
    return true;
}
function isAssignmentExpressionTo(exprStmt, name) {
    if (!ts.isBinaryExpression(exprStmt.expression)) {
        return false;
    }
    const expr = exprStmt.expression;
    if (!ts.isPropertyAccessExpression(expr.left)) {
        return false;
    }
    const propAccess = expr.left;
    if (propAccess.name.text !== name) {
        return false;
    }
    if (!ts.isIdentifier(propAccess.expression)) {
        return false;
    }
    if (expr.operatorToken.kind !== ts.SyntaxKind.FirstAssignment) {
        return false;
    }
    return true;
}
// Each Ivy private call expression is inside an IIFE
function getIifeStatement(exprStmt) {
    const expression = exprStmt.expression;
    if (!expression || !ts.isCallExpression(expression) || expression.arguments.length !== 0) {
        return null;
    }
    const parenExpr = expression;
    if (!ts.isParenthesizedExpression(parenExpr.expression)) {
        return null;
    }
    const funExpr = parenExpr.expression.expression;
    if (!ts.isFunctionExpression(funExpr)) {
        return null;
    }
    const innerStmts = funExpr.body.statements;
    if (innerStmts.length !== 1) {
        return null;
    }
    const innerExprStmt = innerStmts[0];
    if (!ts.isExpressionStatement(innerExprStmt)) {
        return null;
    }
    return innerExprStmt;
}
function isIvyPrivateCallExpression(expression, name) {
    // Now we're in the IIFE and have the inner expression statement. We can check if it matches
    // a private Ivy call.
    if (!ts.isCallExpression(expression)) {
        return false;
    }
    const propAccExpr = expression.expression;
    if (!ts.isPropertyAccessExpression(propAccExpr)) {
        return false;
    }
    if (propAccExpr.name.text != name) {
        return false;
    }
    return true;
}
// Remove Angular decorators from`Clazz.decorators = [...];`, or expression itself if all are
// removed.
function pickDecorationNodesToRemove(exprStmt, ngMetadata, checker) {
    const expr = expect(exprStmt.expression, ts.SyntaxKind.BinaryExpression);
    const literal = expect(expr.right, ts.SyntaxKind.ArrayLiteralExpression);
    if (!literal.elements.every((elem) => ts.isObjectLiteralExpression(elem))) {
        return [];
    }
    const elements = literal.elements;
    const ngDecorators = elements.filter((elem) => isAngularDecorator(elem, ngMetadata, checker));
    return elements.length > ngDecorators.length ? ngDecorators : [exprStmt];
}
// Remove Angular decorators from `Clazz = __decorate([...], Clazz)`, or expression itself if all
// are removed.
function pickDecorateNodesToRemove(exprStmt, tslibImports, ngMetadata, checker) {
    let callExpr;
    if (ts.isCallExpression(exprStmt.expression)) {
        callExpr = exprStmt.expression;
    }
    else if (ts.isBinaryExpression(exprStmt.expression)) {
        const expr = exprStmt.expression;
        if (ts.isCallExpression(expr.right)) {
            callExpr = expr.right;
        }
        else if (ts.isBinaryExpression(expr.right) && ts.isCallExpression(expr.right.right)) {
            callExpr = expr.right.right;
        }
    }
    if (!callExpr) {
        return [];
    }
    const arrLiteral = expect(callExpr.arguments[0], ts.SyntaxKind.ArrayLiteralExpression);
    if (!arrLiteral.elements.every((elem) => ts.isCallExpression(elem))) {
        return [];
    }
    const elements = arrLiteral.elements;
    const ngDecoratorCalls = elements.filter((el) => {
        if (!ts.isIdentifier(el.expression)) {
            return false;
        }
        return identifierIsMetadata(el.expression, ngMetadata, checker);
    });
    // Remove __metadata calls of type 'design:paramtypes'.
    const metadataCalls = elements.filter((el) => {
        if (!isTslibHelper(el, '__metadata', tslibImports, checker)) {
            return false;
        }
        if (el.arguments.length < 2 || !ts.isStringLiteral(el.arguments[0])) {
            return false;
        }
        return true;
    });
    // Remove all __param calls.
    const paramCalls = elements.filter((el) => {
        if (!isTslibHelper(el, '__param', tslibImports, checker)) {
            return false;
        }
        if (el.arguments.length !== 2 || !ts.isNumericLiteral(el.arguments[0])) {
            return false;
        }
        return true;
    });
    if (ngDecoratorCalls.length === 0) {
        return [];
    }
    const callCount = ngDecoratorCalls.length + metadataCalls.length + paramCalls.length;
    // If all decorators are metadata decorators then return the whole `Class = __decorate([...])'`
    // statement so that it is removed in entirety.
    // If not then only remove the Angular decorators.
    // The metadata and param calls may be used by the non-Angular decorators.
    return elements.length === callCount ? [exprStmt] : ngDecoratorCalls;
}
// Remove Angular decorators from`Clazz.propDecorators = [...];`, or expression itself if all
// are removed.
function pickPropDecorationNodesToRemove(exprStmt, ngMetadata, checker) {
    const expr = expect(exprStmt.expression, ts.SyntaxKind.BinaryExpression);
    const literal = expect(expr.right, ts.SyntaxKind.ObjectLiteralExpression);
    if (!literal.properties.every((elem) => ts.isPropertyAssignment(elem) && ts.isArrayLiteralExpression(elem.initializer))) {
        return [];
    }
    const assignments = literal.properties;
    // Consider each assignment individually. Either the whole assignment will be removed or
    // a particular decorator within will.
    const toRemove = assignments
        .map((assign) => {
        const decorators = expect(assign.initializer, ts.SyntaxKind.ArrayLiteralExpression).elements;
        if (!decorators.every((el) => ts.isObjectLiteralExpression(el))) {
            return [];
        }
        const decsToRemove = decorators.filter((expression) => {
            const lit = expect(expression, ts.SyntaxKind.ObjectLiteralExpression);
            return isAngularDecorator(lit, ngMetadata, checker);
        });
        if (decsToRemove.length === decorators.length) {
            return [assign];
        }
        return decsToRemove;
    })
        .reduce((accum, toRm) => accum.concat(toRm), []);
    // If every node to be removed is a property assignment (full property's decorators) and
    // all properties are accounted for, remove the whole assignment. Otherwise, remove the
    // nodes which were marked as safe.
    if (toRemove.length === assignments.length &&
        toRemove.every((node) => ts.isPropertyAssignment(node))) {
        return [exprStmt];
    }
    return toRemove;
}
function isAngularDecorator(literal, ngMetadata, checker) {
    const types = literal.properties.filter(isTypeProperty);
    if (types.length !== 1) {
        return false;
    }
    const assign = expect(types[0], ts.SyntaxKind.PropertyAssignment);
    if (!ts.isIdentifier(assign.initializer)) {
        return false;
    }
    const id = assign.initializer;
    const res = identifierIsMetadata(id, ngMetadata, checker);
    return res;
}
function isTypeProperty(prop) {
    if (!ts.isPropertyAssignment(prop)) {
        return false;
    }
    if (!ts.isIdentifier(prop.name)) {
        return false;
    }
    return prop.name.text === 'type';
}
// Check if an identifier is part of the known Angular Metadata.
function identifierIsMetadata(id, metadata, checker) {
    const symbol = checker.getSymbolAtLocation(id);
    if (!symbol || !symbol.declarations || !symbol.declarations.length) {
        return false;
    }
    return symbol.declarations.some((spec) => metadata.includes(spec));
}
// Find all named imports for `tslib`.
function findTslibImports(node) {
    const imports = [];
    ts.forEachChild(node, (child) => {
        var _a, _b;
        if (ts.isImportDeclaration(child) &&
            child.moduleSpecifier &&
            ts.isStringLiteral(child.moduleSpecifier) &&
            child.moduleSpecifier.text === 'tslib' &&
            ((_a = child.importClause) === null || _a === void 0 ? void 0 : _a.namedBindings) &&
            ts.isNamedImports((_b = child.importClause) === null || _b === void 0 ? void 0 : _b.namedBindings)) {
            imports.push(child.importClause.namedBindings);
        }
    });
    return imports;
}
// Check if a function call is a tslib helper.
function isTslibHelper(callExpr, helper, tslibImports, checker) {
    var _a;
    if (!ts.isIdentifier(callExpr.expression) || callExpr.expression.text !== helper) {
        return false;
    }
    const symbol = checker.getSymbolAtLocation(callExpr.expression);
    if (!((_a = symbol === null || symbol === void 0 ? void 0 : symbol.declarations) === null || _a === void 0 ? void 0 : _a.length)) {
        return false;
    }
    for (const dec of symbol.declarations) {
        if (ts.isImportSpecifier(dec) && tslibImports.some((name) => name.elements.includes(dec))) {
            return true;
        }
        // Handle inline helpers `var __decorate = (this...`
        if (ts.isVariableDeclaration(dec)) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NydWItZmlsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2J1aWxkX29wdGltaXplci9zcmMvdHJhbnNmb3Jtcy9zY3J1Yi1maWxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsK0NBQWlDO0FBQ2pDLG9EQUF3RDtBQUV4RCxTQUFnQixhQUFhLENBQUMsT0FBZTtJQUMzQyxNQUFNLE9BQU8sR0FBRztRQUNkLFlBQVk7UUFDWixZQUFZO1FBQ1osZ0JBQWdCO1FBQ2hCLGdCQUFnQjtRQUNoQixtQkFBbUI7S0FDcEIsQ0FBQztJQUVGLE9BQU8sT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQzVELENBQUM7QUFWRCxzQ0FVQztBQUVELFNBQWdCLGlDQUFpQyxDQUMvQyxpQkFBMEI7SUFFMUIsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsb0JBQW9CLENBQUMsT0FBTyxFQUFFLGlCQUFpQixDQUFDLENBQUM7QUFDdkUsQ0FBQztBQUpELDhFQUlDO0FBRUQsU0FBUyxvQkFBb0IsQ0FBQyxPQUErQixFQUFFLGlCQUEwQjtJQUN2RixJQUFJLENBQUMsT0FBTyxFQUFFO1FBQ1osTUFBTSxJQUFJLEtBQUssQ0FBQyxxREFBcUQsQ0FBQyxDQUFDO0tBQ3hFO0lBQ0QsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLGNBQWMsRUFBRSxDQUFDO0lBRXpDLE9BQU8sQ0FBQyxPQUFpQyxFQUFpQyxFQUFFO1FBQzFFLE1BQU0sV0FBVyxHQUFrQyxDQUFDLEVBQWlCLEVBQUUsRUFBRTtZQUN2RSxNQUFNLFVBQVUsR0FBRyxtQkFBbUIsQ0FBQyxFQUFFLEVBQUUsaUJBQWlCLENBQUMs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QUFOLE1BQU0sQ0FBRSxZQUFZLDBDQUFFLE1BQU0sQ0FBQSxFQUFFO1FBQ2pDLE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxLQUFLLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FBQyxZQUFZLEVBQUU7UUFDckMsSUFBSSxFQUFFLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLElBQUksWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRTtZQUN6RixPQUFPLElBQUksQ0FBQztTQUNiO1FBRUQsb0RBQW9EO1FBQ3BELElBQUksRUFBRSxDQUFDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxFQUFFO1lBQ2pDLE9BQU8sSUFBSSxDQUFDO1NBQ2I7S0FDRjtJQUVELE9BQU8sS0FBSyxDQUFDO0FBQ2YsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgKiBhcyB0cyBmcm9tICd0eXBlc2NyaXB0JztcbmltcG9ydCB7IGNvbGxlY3REZWVwTm9kZXMgfSBmcm9tICcuLi9oZWxwZXJzL2FzdC11dGlscyc7XG5cbmV4cG9ydCBmdW5jdGlvbiB0ZXN0U2NydWJGaWxlKGNvbnRlbnQ6IHN0cmluZykge1xuICBjb25zdCBtYXJrZXJzID0gW1xuICAgICdkZWNvcmF0b3JzJyxcbiAgICAnX19kZWNvcmF0ZScsXG4gICAgJ3Byb3BEZWNvcmF0b3JzJyxcbiAgICAnY3RvclBhcmFtZXRlcnMnLFxuICAgICfJtXNldENsYXNzTWV0YWRhdGEnLFxuICBdO1xuXG4gIHJldHVybiBtYXJrZXJzLnNvbWUoKG1hcmtlcikgPT4gY29udGVudC5pbmNsdWRlcyhtYXJrZXIpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNjcnViRmlsZVRyYW5zZm9ybWVyRmFjdG9yeShcbiAgaXNBbmd1bGFyQ29yZUZpbGU6IGJvb2xlYW4sXG4pOiAocHJvZ3JhbT86IHRzLlByb2dyYW0pID0+IHRzLlRyYW5zZm9ybWVyRmFjdG9yeTx0cy5Tb3VyY2VGaWxlPiB7XG4gIHJldHVybiAocHJvZ3JhbSkgPT4gc2NydWJGaWxlVHJhbnNmb3JtZXIocHJvZ3JhbSwgaXNBbmd1bGFyQ29yZUZpbGUpO1xufVxuXG5mdW5jdGlvbiBzY3J1YkZpbGVUcmFuc2Zvcm1lcihwcm9ncmFtOiB0cy5Qcm9ncmFtIHwgdW5kZWZpbmVkLCBpc0FuZ3VsYXJDb3JlRmlsZTogYm9vbGVhbikge1xuICBpZiAoIXByb2dyYW0pIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NjcnViRmlsZVRyYW5zZm9ybWVyIHJlcXVpcmVzIGEgVHlwZVNjcmlwdCBQcm9ncmFtLicpO1xuICB9XG4gIGNvbnN0IGNoZWNrZXIgPSBwcm9ncmFtLmdldFR5cGVDaGVja2VyKCk7XG5cbiAgcmV0dXJuIChjb250ZXh0OiB0cy5UcmFuc2Zvcm1hdGlvbkNvbnRleHQpOiB0cy5UcmFuc2Zvcm1lcjx0cy5Tb3VyY2VGaWxlPiA9PiB7XG4gICAgY29uc3QgdHJhbnNmb3JtZXI6IHRzLlRyYW5zZm9ybWVyPHRzLlNvdXJjZUZpbGU+ID0gKHNmOiB0cy5Tb3VyY2VGaWxlKSA9PiB7XG4gICAgICBjb25zdCBuZ01ldGFkYXRhID0gZmluZEFuZ3VsYXJNZXRhZGF0YShzZiwgaXNBbmd1bGFyQ29yZUZpbGUpO1xuICAgICAgY29uc3QgdHNsaWJJbXBvcnRzID0gZmluZFRzbGliSW1wb3J0cyhzZik7XG5cbiAgICAgIGNvbnN0IG5vZGVzOiB0cy5Ob2RlW10gPSBbXTtcbiAgICAgIHRzLmZvckVhY2hDaGlsZChzZiwgY2hlY2tOb2RlRm9yRGVjb3JhdG9ycyk7XG5cbiAgICAgIGZ1bmN0aW9uIGNoZWNrTm9kZUZvckRlY29yYXRvcnMobm9kZTogdHMuTm9kZSk6IHZvaWQge1xuICAgICAgICBpZiAoIXRzLmlzRXhwcmVzc2lvblN0YXRlbWVudChub2RlKSkge1xuICAgICAgICAgIHJldHVybiB0cy5mb3JFYWNoQ2hpbGQobm9kZSwgY2hlY2tOb2RlRm9yRGVjb3JhdG9ycyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBleHByU3RtdCA9IG5vZGUgYXMgdHMuRXhwcmVzc2lvblN0YXRlbWVudDtcbiAgICAgICAgY29uc3QgaWlmZSA9IGdldElpZmVTdGF0ZW1lbnQoZXhwclN0bXQpPy5leHByZXNzaW9uO1xuICAgICAgICAvLyBEbyBjaGVja3MgdGhhdCBkb24ndCBuZWVkIHRoZSB0eXBlY2hlY2tlciBmaXJzdCBhbmQgYmFpbCBlYXJseS5cbiAgICAgICAgaWYgKGlzQ3RvclBhcmFtc0Fzc2lnbm1lbnRFeHByZXNzaW9uKGV4cHJTdG10KSkge1xuICAgICAgICAgIG5vZGVzLnB1c2gobm9kZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoaWlmZSAmJiBpc0l2eVByaXZhdGVDYWxsRXhwcmVzc2lvbihpaWZlLCAnybVzZXRDbGFzc01ldGFkYXRhJykpIHtcbiAgICAgICAgICBub2Rlcy5wdXNoKG5vZGUpO1xuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIGlpZmUgJiZcbiAgICAgICAgICB0cy5pc0JpbmFyeUV4cHJlc3Npb24oaWlmZSkgJiZcbiAgICAgICAgICBpc0l2eVByaXZhdGVDYWxsRXhwcmVzc2lvbihpaWZlLnJpZ2h0LCAnybVzZXRDbGFzc01ldGFkYXRhJylcbiAgICAgICAgKSB7XG4gICAgICAgICAgbm9kZXMucHVzaChub2RlKTtcbiAgICAgICAgfSBlbHNlIGlmIChpc0RlY29yYXRvckFzc2lnbm1lbnRFeHByZXNzaW9uKGV4cHJTdG10KSkge1xuICAgICAgICAgIG5vZGVzLnB1c2goLi4ucGlja0RlY29yYXRpb25Ob2Rlc1RvUmVtb3ZlKGV4cHJTdG10LCBuZ01ldGFkYXRhLCBjaGVja2VyKSk7XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgaXNEZWNvcmF0ZUFzc2lnbm1lbnRFeHByZXNzaW9uKGV4cHJTdG10LCB0c2xpYkltcG9ydHMsIGNoZWNrZXIpIHx8XG4gICAgICAgICAgaXNBbmd1bGFyRGVjb3JhdG9yRXhwcmVzc2lvbihleHByU3RtdCwgbmdNZXRhZGF0YSwgdHNsaWJJbXBvcnRzLCBjaGVja2VyKVxuICAgICAgICApIHtcbiAgICAgICAgICBub2Rlcy5wdXNoKC4uLnBpY2tEZWNvcmF0ZU5vZGVzVG9SZW1vdmUoZXhwclN0bXQsIHRzbGliSW1wb3J0cywgbmdNZXRhZGF0YSwgY2hlY2tlcikpO1xuICAgICAgICB9IGVsc2UgaWYgKGlzUHJvcERlY29yYXRvckFzc2lnbm1lbnRFeHByZXNzaW9uKGV4cHJTdG10KSkge1xuICAgICAgICAgIG5vZGVzLnB1c2goLi4ucGlja1Byb3BEZWNvcmF0aW9uTm9kZXNUb1JlbW92ZShleHByU3RtdCwgbmdNZXRhZGF0YSwgY2hlY2tlcikpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHZpc2l0b3I6IHRzLlZpc2l0b3IgPSAobm9kZTogdHMuTm9kZSk6IHRzLlZpc2l0UmVzdWx0PHRzLk5vZGU+ID0+IHtcbiAgICAgICAgLy8gQ2hlY2sgaWYgbm9kZSBpcyBhIHN0YXRlbWVudCB0byBiZSBkcm9wcGVkLlxuICAgICAgICBpZiAobm9kZXMuZmluZCgobikgPT4gbiA9PT0gbm9kZSkpIHtcbiAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gT3RoZXJ3aXNlIHJldHVybiBub2RlIGFzIGlzLlxuICAgICAgICByZXR1cm4gdHMudmlzaXRFYWNoQ2hpbGQobm9kZSwgdmlzaXRvciwgY29udGV4dCk7XG4gICAgICB9O1xuXG4gICAgICByZXR1cm4gdHMudmlzaXROb2RlKHNmLCB2aXNpdG9yKTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRyYW5zZm9ybWVyO1xuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwZWN0PFQgZXh0ZW5kcyB0cy5Ob2RlPihub2RlOiB0cy5Ob2RlLCBraW5kOiB0cy5TeW50YXhLaW5kKTogVCB7XG4gIGlmIChub2RlLmtpbmQgIT09IGtpbmQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbm9kZSB0eXBlLicpO1xuICB9XG5cbiAgcmV0dXJuIG5vZGUgYXMgVDtcbn1cblxuZnVuY3Rpb24gZmluZEFuZ3VsYXJNZXRhZGF0YShub2RlOiB0cy5Ob2RlLCBpc0FuZ3VsYXJDb3JlRmlsZTogYm9vbGVhbik6IHRzLk5vZGVbXSB7XG4gIGxldCBzcGVjczogdHMuTm9kZVtdID0gW107XG4gIC8vIEZpbmQgYWxsIHNwZWNpZmllcnMgZnJvbSBpbXBvcnRzIG9mIGBAYW5ndWxhci9jb3JlYC5cbiAgdHMuZm9yRWFjaENoaWxkKG5vZGUsIChjaGlsZCkgPT4ge1xuICAgIGlmIChjaGlsZC5raW5kID09PSB0cy5TeW50YXhLaW5kLkltcG9ydERlY2xhcmF0aW9uKSB7XG4gICAgICBjb25zdCBpbXBvcnREZWNsID0gY2hpbGQgYXMgdHMuSW1wb3J0RGVjbGFyYXRpb247XG4gICAgICBpZiAoaXNBbmd1bGFyQ29yZUltcG9ydChpbXBvcnREZWNsLCBpc0FuZ3VsYXJDb3JlRmlsZSkpIHtcbiAgICAgICAgc3BlY3MucHVzaChcbiAgICAgICAgICAuLi5jb2xsZWN0RGVlcE5vZGVzPHRzLkltcG9ydFNwZWNpZmllcj4oaW1wb3J0RGVjbCwgdHMuU3ludGF4S2luZC5JbXBvcnRTcGVjaWZpZXIpLFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG5cbiAgLy8gSWYgdGhlIGN1cnJlbnQgbW9kdWxlIGlzIGEgQW5ndWxhciBjb3JlIGZpbGUsIHdlIGFsc28gY29uc2lkZXIgYWxsIGRlY2xhcmF0aW9ucyBpbiBpdCB0b1xuICAvLyBwb3RlbnRpYWxseSBiZSBBbmd1bGFyIG1ldGFkYXRhLlxuICBpZiAoaXNBbmd1bGFyQ29yZUZpbGUpIHtcbiAgICBjb25zdCBsb2NhbERlY2wgPSBmaW5kQWxsRGVjbGFyYXRpb25zKG5vZGUpO1xuICAgIHNwZWNzID0gc3BlY3MuY29uY2F0KGxvY2FsRGVjbCk7XG4gIH1cblxuICByZXR1cm4gc3BlY3M7XG59XG5cbmZ1bmN0aW9uIGZpbmRBbGxEZWNsYXJhdGlvbnMobm9kZTogdHMuTm9kZSk6IHRzLlZhcmlhYmxlRGVjbGFyYXRpb25bXSB7XG4gIGNvbnN0IG5vZGVzOiB0cy5WYXJpYWJsZURlY2xhcmF0aW9uW10gPSBbXTtcbiAgdHMuZm9yRWFjaENoaWxkKG5vZGUsIChjaGlsZCkgPT4ge1xuICAgIGlmIChjaGlsZC5raW5kID09PSB0cy5TeW50YXhLaW5kLlZhcmlhYmxlU3RhdGVtZW50KSB7XG4gICAgICBjb25zdCB2U3RtdCA9IGNoaWxkIGFzIHRzLlZhcmlhYmxlU3RhdGVtZW50O1xuICAgICAgdlN0bXQuZGVjbGFyYXRpb25MaXN0LmRlY2xhcmF0aW9ucy5mb3JFYWNoKChkZWNsKSA9PiB7XG4gICAgICAgIGlmIChkZWNsLm5hbWUua2luZCAhPT0gdHMuU3ludGF4S2luZC5JZGVudGlmaWVyKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIG5vZGVzLnB1c2goZGVjbCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBub2Rlcztcbn1cblxuZnVuY3Rpb24gaXNBbmd1bGFyQ29yZUltcG9ydChub2RlOiB0cy5JbXBvcnREZWNsYXJhdGlvbiwgaXNBbmd1bGFyQ29yZUZpbGU6IGJvb2xlYW4pOiBib29sZWFuIHtcbiAgaWYgKCEobm9kZS5tb2R1bGVTcGVjaWZpZXIgJiYgdHMuaXNTdHJpbmdMaXRlcmFsKG5vZGUubW9kdWxlU3BlY2lmaWVyKSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY29uc3QgaW1wb3J0VGV4dCA9IG5vZGUubW9kdWxlU3BlY2lmaWVyLnRleHQ7XG5cbiAgLy8gSW1wb3J0cyB0byBgQGFuZ3VsYXIvY29yZWAgYXJlIGFsd2F5cyBjb3JlIGltcG9ydHMuXG4gIGlmIChpbXBvcnRUZXh0ID09PSAnQGFuZ3VsYXIvY29yZScpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIC8vIFJlbGF0aXZlIGltcG9ydHMgZnJvbSBhIEFuZ3VsYXIgY29yZSBmaWxlIGFyZSBhbHNvIGNvcmUgaW1wb3J0cy5cbiAgaWYgKGlzQW5ndWxhckNvcmVGaWxlICYmIGltcG9ydFRleHQuc3RhcnRzV2l0aCgnLicpKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICByZXR1cm4gZmFsc2U7XG59XG5cbi8vIENoZWNrIGlmIGFzc2lnbm1lbnQgaXMgYENsYXp6LmRlY29yYXRvcnMgPSBbLi4uXTtgLlxuZnVuY3Rpb24gaXNEZWNvcmF0b3JBc3NpZ25tZW50RXhwcmVzc2lvbihleHByU3RtdDogdHMuRXhwcmVzc2lvblN0YXRlbWVudCk6IGJvb2xlYW4ge1xuICBpZiAoIWlzQXNzaWdubWVudEV4cHJlc3Npb25UbyhleHByU3RtdCwgJ2RlY29yYXRvcnMnKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjb25zdCBleHByID0gZXhwclN0bXQuZXhwcmVzc2lvbiBhcyB0cy5CaW5hcnlFeHByZXNzaW9uO1xuICBpZiAoIXRzLmlzQXJyYXlMaXRlcmFsRXhwcmVzc2lvbihleHByLnJpZ2h0KSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyBDaGVjayBpZiBhc3NpZ25tZW50IGlzIGBDbGF6eiA9IF9fZGVjb3JhdGUoWy4uLl0sIENsYXp6KWAuXG5mdW5jdGlvbiBpc0RlY29yYXRlQXNzaWdubWVudEV4cHJlc3Npb24oXG4gIGV4cHJTdG10OiB0cy5FeHByZXNzaW9uU3RhdGVtZW50LFxuICB0c2xpYkltcG9ydHM6IHRzLk5hbWVkSW1wb3J0c1tdLFxuICBjaGVja2VyOiB0cy5UeXBlQ2hlY2tlcixcbik6IGJvb2xlYW4ge1xuICBpZiAoIXRzLmlzQmluYXJ5RXhwcmVzc2lvbihleHByU3RtdC5leHByZXNzaW9uKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjb25zdCBleHByID0gZXhwclN0bXQuZXhwcmVzc2lvbjtcbiAgaWYgKCF0cy5pc0lkZW50aWZpZXIoZXhwci5sZWZ0KSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjb25zdCBjbGFzc0lkZW50ID0gZXhwci5sZWZ0O1xuICBsZXQgY2FsbEV4cHI6IHRzLkNhbGxFeHByZXNzaW9uO1xuXG4gIGlmICh0cy5pc0NhbGxFeHByZXNzaW9uKGV4cHIucmlnaHQpKSB7XG4gICAgY2FsbEV4cHIgPSBleHByLnJpZ2h0O1xuICB9IGVsc2UgaWYgKHRzLmlzQmluYXJ5RXhwcmVzc2lvbihleHByLnJpZ2h0KSkge1xuICAgIC8vIGBDbGF6eiA9IENsYXp6XzEgPSBfX2RlY29yYXRlKFsuLi5dLCBDbGF6eilgIGNhbiBiZSBmb3VuZCB3aGVuIHRoZXJlIGFyZSBzdGF0aWMgcHJvcGVydHlcbiAgICAvLyBhY2Nlc3Nlcy5cbiAgICBjb25zdCBpbm5lckV4cHIgPSBleHByLnJpZ2h0O1xuICAgIGlmICghdHMuaXNJZGVudGlmaWVyKGlubmVyRXhwci5sZWZ0KSB8fCAhdHMuaXNDYWxsRXhwcmVzc2lvbihpbm5lckV4cHIucmlnaHQpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNhbGxFeHByID0gaW5uZXJFeHByLnJpZ2h0O1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmICghaXNUc2xpYkhlbHBlcihjYWxsRXhwciwgJ19fZGVjb3JhdGUnLCB0c2xpYkltcG9ydHMsIGNoZWNrZXIpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKGNhbGxFeHByLmFyZ3VtZW50cy5sZW5ndGggIT09IDIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBjb25zdCBjbGFzc0FyZyA9IGNhbGxFeHByLmFyZ3VtZW50c1sxXTtcbiAgaWYgKCF0cy5pc0lkZW50aWZpZXIoY2xhc3NBcmcpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKGNsYXNzSWRlbnQudGV4dCAhPT0gY2xhc3NBcmcudGV4dCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoIXRzLmlzQXJyYXlMaXRlcmFsRXhwcmVzc2lvbihjYWxsRXhwci5hcmd1bWVudHNbMF0pKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIENoZWNrIGlmIGV4cHJlc3Npb24gaXMgYF9fZGVjb3JhdGUoW3NtdCwgX19tZXRhZGF0YShcImRlc2lnbjp0eXBlXCIsIE9iamVjdCldLCAuLi4pYC5cbmZ1bmN0aW9uIGlzQW5ndWxhckRlY29yYXRvckV4cHJlc3Npb24oXG4gIGV4cHJTdG10OiB0cy5FeHByZXNzaW9uU3RhdGVtZW50LFxuICBuZ01ldGFkYXRhOiB0cy5Ob2RlW10sXG4gIHRzbGliSW1wb3J0czogdHMuTmFtZWRJbXBvcnRzW10sXG4gIGNoZWNrZXI6IHRzLlR5cGVDaGVja2VyLFxuKTogYm9vbGVhbiB7XG4gIGlmICghdHMuaXNDYWxsRXhwcmVzc2lvbihleHByU3RtdC5leHByZXNzaW9uKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjb25zdCBjYWxsRXhwciA9IGV4cHJTdG10LmV4cHJlc3Npb247XG4gIGlmICghaXNUc2xpYkhlbHBlcihjYWxsRXhwciwgJ19fZGVjb3JhdGUnLCB0c2xpYkltcG9ydHMsIGNoZWNrZXIpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChjYWxsRXhwci5hcmd1bWVudHMubGVuZ3RoICE9PSA0KSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IGRlY29yYXRlQXJyYXkgPSBjYWxsRXhwci5hcmd1bWVudHNbMF07XG4gIGlmICghdHMuaXNBcnJheUxpdGVyYWxFeHByZXNzaW9uKGRlY29yYXRlQXJyYXkpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIC8vIENoZWNrIGZpcnN0IGFycmF5IGVudHJ5IGZvciBBbmd1bGFyIGRlY29yYXRvcnMuXG4gIGlmIChkZWNvcmF0ZUFycmF5LmVsZW1lbnRzLmxlbmd0aCA9PT0gMCB8fCAhdHMuaXNDYWxsRXhwcmVzc2lvbihkZWNvcmF0ZUFycmF5LmVsZW1lbnRzWzBdKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiBkZWNvcmF0ZUFycmF5LmVsZW1lbnRzLnNvbWUoKGRlY29yYXRvckNhbGwpID0+IHtcbiAgICBpZiAoIXRzLmlzQ2FsbEV4cHJlc3Npb24oZGVjb3JhdG9yQ2FsbCkgfHwgIXRzLmlzSWRlbnRpZmllcihkZWNvcmF0b3JDYWxsLmV4cHJlc3Npb24pKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgZGVjb3JhdG9ySWQgPSBkZWNvcmF0b3JDYWxsLmV4cHJlc3Npb247XG5cbiAgICByZXR1cm4gaWRlbnRpZmllcklzTWV0YWRhdGEoZGVjb3JhdG9ySWQsIG5nTWV0YWRhdGEsIGNoZWNrZXIpO1xuICB9KTtcbn1cblxuLy8gQ2hlY2sgaWYgYXNzaWdubWVudCBpcyBgQ2xhenoucHJvcERlY29yYXRvcnMgPSBbLi4uXTtgLlxuZnVuY3Rpb24gaXNQcm9wRGVjb3JhdG9yQXNzaWdubWVudEV4cHJlc3Npb24oZXhwclN0bXQ6IHRzLkV4cHJlc3Npb25TdGF0ZW1lbnQpOiBib29sZWFuIHtcbiAgaWYgKCFpc0Fzc2lnbm1lbnRFeHByZXNzaW9uVG8oZXhwclN0bXQsICdwcm9wRGVjb3JhdG9ycycpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IGV4cHIgPSBleHByU3RtdC5leHByZXNzaW9uIGFzIHRzLkJpbmFyeUV4cHJlc3Npb247XG4gIGlmIChleHByLnJpZ2h0LmtpbmQgIT09IHRzLlN5bnRheEtpbmQuT2JqZWN0TGl0ZXJhbEV4cHJlc3Npb24pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gQ2hlY2sgaWYgYXNzaWdubWVudCBpcyBgQ2xhenouY3RvclBhcmFtZXRlcnMgPSBbLi4uXTtgLlxuZnVuY3Rpb24gaXNDdG9yUGFyYW1zQXNzaWdubWVudEV4cHJlc3Npb24oZXhwclN0bXQ6IHRzLkV4cHJlc3Npb25TdGF0ZW1lbnQpOiBib29sZWFuIHtcbiAgaWYgKCFpc0Fzc2lnbm1lbnRFeHByZXNzaW9uVG8oZXhwclN0bXQsICdjdG9yUGFyYW1ldGVycycpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IGV4cHIgPSBleHByU3RtdC5leHByZXNzaW9uIGFzIHRzLkJpbmFyeUV4cHJlc3Npb247XG4gIGlmIChcbiAgICBleHByLnJpZ2h0LmtpbmQgIT09IHRzLlN5bnRheEtpbmQuRnVuY3Rpb25FeHByZXNzaW9uICYmXG4gICAgZXhwci5yaWdodC5raW5kICE9PSB0cy5TeW50YXhLaW5kLkFycm93RnVuY3Rpb25cbiAgKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzQXNzaWdubWVudEV4cHJlc3Npb25UbyhleHByU3RtdDogdHMuRXhwcmVzc2lvblN0YXRlbWVudCwgbmFtZTogc3RyaW5nKSB7XG4gIGlmICghdHMuaXNCaW5hcnlFeHByZXNzaW9uKGV4cHJTdG10LmV4cHJlc3Npb24pKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IGV4cHIgPSBleHByU3RtdC5leHByZXNzaW9uO1xuICBpZiAoIXRzLmlzUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKGV4cHIubGVmdCkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY29uc3QgcHJvcEFjY2VzcyA9IGV4cHIubGVmdDtcbiAgaWYgKHByb3BBY2Nlc3MubmFtZS50ZXh0ICE9PSBuYW1lKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICghdHMuaXNJZGVudGlmaWVyKHByb3BBY2Nlc3MuZXhwcmVzc2lvbikpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGV4cHIub3BlcmF0b3JUb2tlbi5raW5kICE9PSB0cy5TeW50YXhLaW5kLkZpcnN0QXNzaWdubWVudCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyBFYWNoIEl2eSBwcml2YXRlIGNhbGwgZXhwcmVzc2lvbiBpcyBpbnNpZGUgYW4gSUlGRVxuZnVuY3Rpb24gZ2V0SWlmZVN0YXRlbWVudChleHByU3RtdDogdHMuRXhwcmVzc2lvblN0YXRlbWVudCk6IG51bGwgfCB0cy5FeHByZXNzaW9uU3RhdGVtZW50IHtcbiAgY29uc3QgZXhwcmVzc2lvbiA9IGV4cHJTdG10LmV4cHJlc3Npb247XG4gIGlmICghZXhwcmVzc2lvbiB8fCAhdHMuaXNDYWxsRXhwcmVzc2lvbihleHByZXNzaW9uKSB8fCBleHByZXNzaW9uLmFyZ3VtZW50cy5sZW5ndGggIT09IDApIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGNvbnN0IHBhcmVuRXhwciA9IGV4cHJlc3Npb247XG4gIGlmICghdHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihwYXJlbkV4cHIuZXhwcmVzc2lvbikpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGNvbnN0IGZ1bkV4cHIgPSBwYXJlbkV4cHIuZXhwcmVzc2lvbi5leHByZXNzaW9uO1xuICBpZiAoIXRzLmlzRnVuY3Rpb25FeHByZXNzaW9uKGZ1bkV4cHIpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBpbm5lclN0bXRzID0gZnVuRXhwci5ib2R5LnN0YXRlbWVudHM7XG4gIGlmIChpbm5lclN0bXRzLmxlbmd0aCAhPT0gMSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgaW5uZXJFeHByU3RtdCA9IGlubmVyU3RtdHNbMF07XG4gIGlmICghdHMuaXNFeHByZXNzaW9uU3RhdGVtZW50KGlubmVyRXhwclN0bXQpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICByZXR1cm4gaW5uZXJFeHByU3RtdDtcbn1cblxuZnVuY3Rpb24gaXNJdnlQcml2YXRlQ2FsbEV4cHJlc3Npb24oZXhwcmVzc2lvbjogdHMuRXhwcmVzc2lvbiwgbmFtZTogc3RyaW5nKSB7XG4gIC8vIE5vdyB3ZSdyZSBpbiB0aGUgSUlGRSBhbmQgaGF2ZSB0aGUgaW5uZXIgZXhwcmVzc2lvbiBzdGF0ZW1lbnQuIFdlIGNhbiBjaGVjayBpZiBpdCBtYXRjaGVzXG4gIC8vIGEgcHJpdmF0ZSBJdnkgY2FsbC5cbiAgaWYgKCF0cy5pc0NhbGxFeHByZXNzaW9uKGV4cHJlc3Npb24pKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgcHJvcEFjY0V4cHIgPSBleHByZXNzaW9uLmV4cHJlc3Npb247XG4gIGlmICghdHMuaXNQcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24ocHJvcEFjY0V4cHIpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKHByb3BBY2NFeHByLm5hbWUudGV4dCAhPSBuYW1lKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIFJlbW92ZSBBbmd1bGFyIGRlY29yYXRvcnMgZnJvbWBDbGF6ei5kZWNvcmF0b3JzID0gWy4uLl07YCwgb3IgZXhwcmVzc2lvbiBpdHNlbGYgaWYgYWxsIGFyZVxuLy8gcmVtb3ZlZC5cbmZ1bmN0aW9uIHBpY2tEZWNvcmF0aW9uTm9kZXNUb1JlbW92ZShcbiAgZXhwclN0bXQ6IHRzLkV4cHJlc3Npb25TdGF0ZW1lbnQsXG4gIG5nTWV0YWRhdGE6IHRzLk5vZGVbXSxcbiAgY2hlY2tlcjogdHMuVHlwZUNoZWNrZXIsXG4pOiB0cy5Ob2RlW10ge1xuICBjb25zdCBleHByID0gZXhwZWN0PHRzLkJpbmFyeUV4cHJlc3Npb24+KGV4cHJTdG10LmV4cHJlc3Npb24sIHRzLlN5bnRheEtpbmQuQmluYXJ5RXhwcmVzc2lvbik7XG4gIGNvbnN0IGxpdGVyYWwgPSBleHBlY3Q8dHMuQXJyYXlMaXRlcmFsRXhwcmVzc2lvbj4oXG4gICAgZXhwci5yaWdodCxcbiAgICB0cy5TeW50YXhLaW5kLkFycmF5TGl0ZXJhbEV4cHJlc3Npb24sXG4gICk7XG4gIGlmICghbGl0ZXJhbC5lbGVtZW50cy5ldmVyeSgoZWxlbSkgPT4gdHMuaXNPYmplY3RMaXRlcmFsRXhwcmVzc2lvbihlbGVtKSkpIHtcbiAgICByZXR1cm4gW107XG4gIH1cbiAgY29uc3QgZWxlbWVudHMgPSBsaXRlcmFsLmVsZW1lbnRzIGFzIHRzLk5vZGVBcnJheTx0cy5PYmplY3RMaXRlcmFsRXhwcmVzc2lvbj47XG4gIGNvbnN0IG5nRGVjb3JhdG9ycyA9IGVsZW1lbnRzLmZpbHRlcigoZWxlbSkgPT4gaXNBbmd1bGFyRGVjb3JhdG9yKGVsZW0sIG5nTWV0YWRhdGEsIGNoZWNrZXIpKTtcblxuICByZXR1cm4gZWxlbWVudHMubGVuZ3RoID4gbmdEZWNvcmF0b3JzLmxlbmd0aCA/IG5nRGVjb3JhdG9ycyA6IFtleHByU3RtdF07XG59XG5cbi8vIFJlbW92ZSBBbmd1bGFyIGRlY29yYXRvcnMgZnJvbSBgQ2xhenogPSBfX2RlY29yYXRlKFsuLi5dLCBDbGF6eilgLCBvciBleHByZXNzaW9uIGl0c2VsZiBpZiBhbGxcbi8vIGFyZSByZW1vdmVkLlxuZnVuY3Rpb24gcGlja0RlY29yYXRlTm9kZXNUb1JlbW92ZShcbiAgZXhwclN0bXQ6IHRzLkV4cHJlc3Npb25TdGF0ZW1lbnQsXG4gIHRzbGliSW1wb3J0czogdHMuTmFtZWRJbXBvcnRzW10sXG4gIG5nTWV0YWRhdGE6IHRzLk5vZGVbXSxcbiAgY2hlY2tlcjogdHMuVHlwZUNoZWNrZXIsXG4pOiB0cy5Ob2RlW10ge1xuICBsZXQgY2FsbEV4cHI6IHRzLkNhbGxFeHByZXNzaW9uIHwgdW5kZWZpbmVkO1xuICBpZiAodHMuaXNDYWxsRXhwcmVzc2lvbihleHByU3RtdC5leHByZXNzaW9uKSkge1xuICAgIGNhbGxFeHByID0gZXhwclN0bXQuZXhwcmVzc2lvbjtcbiAgfSBlbHNlIGlmICh0cy5pc0JpbmFyeUV4cHJlc3Npb24oZXhwclN0bXQuZXhwcmVzc2lvbikpIHtcbiAgICBjb25zdCBleHByID0gZXhwclN0bXQuZXhwcmVzc2lvbjtcbiAgICBpZiAodHMuaXNDYWxsRXhwcmVzc2lvbihleHByLnJpZ2h0KSkge1xuICAgICAgY2FsbEV4cHIgPSBleHByLnJpZ2h0O1xuICAgIH0gZWxzZSBpZiAodHMuaXNCaW5hcnlFeHByZXNzaW9uKGV4cHIucmlnaHQpICYmIHRzLmlzQ2FsbEV4cHJlc3Npb24oZXhwci5yaWdodC5yaWdodCkpIHtcbiAgICAgIGNhbGxFeHByID0gZXhwci5yaWdodC5yaWdodDtcbiAgICB9XG4gIH1cblxuICBpZiAoIWNhbGxFeHByKSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgY29uc3QgYXJyTGl0ZXJhbCA9IGV4cGVjdDx0cy5BcnJheUxpdGVyYWxFeHByZXNzaW9uPihcbiAgICBjYWxsRXhwci5hcmd1bWVudHNbMF0sXG4gICAgdHMuU3ludGF4S2luZC5BcnJheUxpdGVyYWxFeHByZXNzaW9uLFxuICApO1xuXG4gIGlmICghYXJyTGl0ZXJhbC5lbGVtZW50cy5ldmVyeSgoZWxlbSkgPT4gdHMuaXNDYWxsRXhwcmVzc2lvbihlbGVtKSkpIHtcbiAgICByZXR1cm4gW107XG4gIH1cbiAgY29uc3QgZWxlbWVudHMgPSBhcnJMaXRlcmFsLmVsZW1lbnRzIGFzIHRzLk5vZGVBcnJheTx0cy5DYWxsRXhwcmVzc2lvbj47XG4gIGNvbnN0IG5nRGVjb3JhdG9yQ2FsbHMgPSBlbGVtZW50cy5maWx0ZXIoKGVsKSA9PiB7XG4gICAgaWYgKCF0cy5pc0lkZW50aWZpZXIoZWwuZXhwcmVzc2lvbikpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gaWRlbnRpZmllcklzTWV0YWRhdGEoZWwuZXhwcmVzc2lvbiwgbmdNZXRhZGF0YSwgY2hlY2tlcik7XG4gIH0pO1xuXG4gIC8vIFJlbW92ZSBfX21ldGFkYXRhIGNhbGxzIG9mIHR5cGUgJ2Rlc2lnbjpwYXJhbXR5cGVzJy5cbiAgY29uc3QgbWV0YWRhdGFDYWxscyA9IGVsZW1lbnRzLmZpbHRlcigoZWwpID0+IHtcbiAgICBpZiAoIWlzVHNsaWJIZWxwZXIoZWwsICdfX21ldGFkYXRhJywgdHNsaWJJbXBvcnRzLCBjaGVja2VyKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmIChlbC5hcmd1bWVudHMubGVuZ3RoIDwgMiB8fCAhdHMuaXNTdHJpbmdMaXRlcmFsKGVsLmFyZ3VtZW50c1swXSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG4gIC8vIFJlbW92ZSBhbGwgX19wYXJhbSBjYWxscy5cbiAgY29uc3QgcGFyYW1DYWxscyA9IGVsZW1lbnRzLmZpbHRlcigoZWwpID0+IHtcbiAgICBpZiAoIWlzVHNsaWJIZWxwZXIoZWwsICdfX3BhcmFtJywgdHNsaWJJbXBvcnRzLCBjaGVja2VyKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmIChlbC5hcmd1bWVudHMubGVuZ3RoICE9PSAyIHx8ICF0cy5pc051bWVyaWNMaXRlcmFsKGVsLmFyZ3VtZW50c1swXSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgaWYgKG5nRGVjb3JhdG9yQ2FsbHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgY29uc3QgY2FsbENvdW50ID0gbmdEZWNvcmF0b3JDYWxscy5sZW5ndGggKyBtZXRhZGF0YUNhbGxzLmxlbmd0aCArIHBhcmFtQ2FsbHMubGVuZ3RoO1xuXG4gIC8vIElmIGFsbCBkZWNvcmF0b3JzIGFyZSBtZXRhZGF0YSBkZWNvcmF0b3JzIHRoZW4gcmV0dXJuIHRoZSB3aG9sZSBgQ2xhc3MgPSBfX2RlY29yYXRlKFsuLi5dKSdgXG4gIC8vIHN0YXRlbWVudCBzbyB0aGF0IGl0IGlzIHJlbW92ZWQgaW4gZW50aXJldHkuXG4gIC8vIElmIG5vdCB0aGVuIG9ubHkgcmVtb3ZlIHRoZSBBbmd1bGFyIGRlY29yYXRvcnMuXG4gIC8vIFRoZSBtZXRhZGF0YSBhbmQgcGFyYW0gY2FsbHMgbWF5IGJlIHVzZWQgYnkgdGhlIG5vbi1Bbmd1bGFyIGRlY29yYXRvcnMuXG4gIHJldHVybiBlbGVtZW50cy5sZW5ndGggPT09IGNhbGxDb3VudCA/IFtleHByU3RtdF0gOiBuZ0RlY29yYXRvckNhbGxzO1xufVxuXG4vLyBSZW1vdmUgQW5ndWxhciBkZWNvcmF0b3JzIGZyb21gQ2xhenoucHJvcERlY29yYXRvcnMgPSBbLi4uXTtgLCBvciBleHByZXNzaW9uIGl0c2VsZiBpZiBhbGxcbi8vIGFyZSByZW1vdmVkLlxuZnVuY3Rpb24gcGlja1Byb3BEZWNvcmF0aW9uTm9kZXNUb1JlbW92ZShcbiAgZXhwclN0bXQ6IHRzLkV4cHJlc3Npb25TdGF0ZW1lbnQsXG4gIG5nTWV0YWRhdGE6IHRzLk5vZGVbXSxcbiAgY2hlY2tlcjogdHMuVHlwZUNoZWNrZXIsXG4pOiB0cy5Ob2RlW10ge1xuICBjb25zdCBleHByID0gZXhwZWN0PHRzLkJpbmFyeUV4cHJlc3Npb24+KGV4cHJTdG10LmV4cHJlc3Npb24sIHRzLlN5bnRheEtpbmQuQmluYXJ5RXhwcmVzc2lvbik7XG4gIGNvbnN0IGxpdGVyYWwgPSBleHBlY3Q8dHMuT2JqZWN0TGl0ZXJhbEV4cHJlc3Npb24+KFxuICAgIGV4cHIucmlnaHQsXG4gICAgdHMuU3ludGF4S2luZC5PYmplY3RMaXRlcmFsRXhwcmVzc2lvbixcbiAgKTtcbiAgaWYgKFxuICAgICFsaXRlcmFsLnByb3BlcnRpZXMuZXZlcnkoXG4gICAgICAoZWxlbSkgPT4gdHMuaXNQcm9wZXJ0eUFzc2lnbm1lbnQoZWxlbSkgJiYgdHMuaXNBcnJheUxpdGVyYWxFeHByZXNzaW9uKGVsZW0uaW5pdGlhbGl6ZXIpLFxuICAgIClcbiAgKSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG4gIGNvbnN0IGFzc2lnbm1lbnRzID0gbGl0ZXJhbC5wcm9wZXJ0aWVzIGFzIHRzLk5vZGVBcnJheTx0cy5Qcm9wZXJ0eUFzc2lnbm1lbnQ+O1xuICAvLyBDb25zaWRlciBlYWNoIGFzc2lnbm1lbnQgaW5kaXZpZHVhbGx5LiBFaXRoZXIgdGhlIHdob2xlIGFzc2lnbm1lbnQgd2lsbCBiZSByZW1vdmVkIG9yXG4gIC8vIGEgcGFydGljdWxhciBkZWNvcmF0b3Igd2l0aGluIHdpbGwuXG4gIGNvbnN0IHRvUmVtb3ZlID0gYXNzaWdubWVudHNcbiAgICAubWFwKChhc3NpZ24pID0+IHtcbiAgICAgIGNvbnN0IGRlY29yYXRvcnMgPSBleHBlY3Q8dHMuQXJyYXlMaXRlcmFsRXhwcmVzc2lvbj4oXG4gICAgICAgIGFzc2lnbi5pbml0aWFsaXplcixcbiAgICAgICAgdHMuU3ludGF4S2luZC5BcnJheUxpdGVyYWxFeHByZXNzaW9uLFxuICAgICAgKS5lbGVtZW50cztcbiAgICAgIGlmICghZGVjb3JhdG9ycy5ldmVyeSgoZWwpID0+IHRzLmlzT2JqZWN0TGl0ZXJhbEV4cHJlc3Npb24oZWwpKSkge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgICBjb25zdCBkZWNzVG9SZW1vdmUgPSBkZWNvcmF0b3JzLmZpbHRlcigoZXhwcmVzc2lvbikgPT4ge1xuICAgICAgICBjb25zdCBsaXQgPSBleHBlY3Q8dHMuT2JqZWN0TGl0ZXJhbEV4cHJlc3Npb24+KFxuICAgICAgICAgIGV4cHJlc3Npb24sXG4gICAgICAgICAgdHMuU3ludGF4S2luZC5PYmplY3RMaXRlcmFsRXhwcmVzc2lvbixcbiAgICAgICAgKTtcblxuICAgICAgICByZXR1cm4gaXNBbmd1bGFyRGVjb3JhdG9yKGxpdCwgbmdNZXRhZGF0YSwgY2hlY2tlcik7XG4gICAgICB9KTtcbiAgICAgIGlmIChkZWNzVG9SZW1vdmUubGVuZ3RoID09PSBkZWNvcmF0b3JzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gW2Fzc2lnbl07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBkZWNzVG9SZW1vdmU7XG4gICAgfSlcbiAgICAucmVkdWNlKChhY2N1bSwgdG9SbSkgPT4gYWNjdW0uY29uY2F0KHRvUm0pLCBbXSBhcyB0cy5Ob2RlW10pO1xuICAvLyBJZiBldmVyeSBub2RlIHRvIGJlIHJlbW92ZWQgaXMgYSBwcm9wZXJ0eSBhc3NpZ25tZW50IChmdWxsIHByb3BlcnR5J3MgZGVjb3JhdG9ycykgYW5kXG4gIC8vIGFsbCBwcm9wZXJ0aWVzIGFyZSBhY2NvdW50ZWQgZm9yLCByZW1vdmUgdGhlIHdob2xlIGFzc2lnbm1lbnQuIE90aGVyd2lzZSwgcmVtb3ZlIHRoZVxuICAvLyBub2RlcyB3aGljaCB3ZXJlIG1hcmtlZCBhcyBzYWZlLlxuICBpZiAoXG4gICAgdG9SZW1vdmUubGVuZ3RoID09PSBhc3NpZ25tZW50cy5sZW5ndGggJiZcbiAgICB0b1JlbW92ZS5ldmVyeSgobm9kZSkgPT4gdHMuaXNQcm9wZXJ0eUFzc2lnbm1lbnQobm9kZSkpXG4gICkge1xuICAgIHJldHVybiBbZXhwclN0bXRdO1xuICB9XG5cbiAgcmV0dXJuIHRvUmVtb3ZlO1xufVxuXG5mdW5jdGlvbiBpc0FuZ3VsYXJEZWNvcmF0b3IoXG4gIGxpdGVyYWw6IHRzLk9iamVjdExpdGVyYWxFeHByZXNzaW9uLFxuICBuZ01ldGFkYXRhOiB0cy5Ob2RlW10sXG4gIGNoZWNrZXI6IHRzLlR5cGVDaGVja2VyLFxuKTogYm9vbGVhbiB7XG4gIGNvbnN0IHR5cGVzID0gbGl0ZXJhbC5wcm9wZXJ0aWVzLmZpbHRlcihpc1R5cGVQcm9wZXJ0eSk7XG4gIGlmICh0eXBlcy5sZW5ndGggIT09IDEpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY29uc3QgYXNzaWduID0gZXhwZWN0PHRzLlByb3BlcnR5QXNzaWdubWVudD4odHlwZXNbMF0sIHRzLlN5bnRheEtpbmQuUHJvcGVydHlBc3NpZ25tZW50KTtcbiAgaWYgKCF0cy5pc0lkZW50aWZpZXIoYXNzaWduLmluaXRpYWxpemVyKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjb25zdCBpZCA9IGFzc2lnbi5pbml0aWFsaXplcjtcbiAgY29uc3QgcmVzID0gaWRlbnRpZmllcklzTWV0YWRhdGEoaWQsIG5nTWV0YWRhdGEsIGNoZWNrZXIpO1xuXG4gIHJldHVybiByZXM7XG59XG5cbmZ1bmN0aW9uIGlzVHlwZVByb3BlcnR5KHByb3A6IHRzLk9iamVjdExpdGVyYWxFbGVtZW50KTogYm9vbGVhbiB7XG4gIGlmICghdHMuaXNQcm9wZXJ0eUFzc2lnbm1lbnQocHJvcCkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoIXRzLmlzSWRlbnRpZmllcihwcm9wLm5hbWUpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHByb3AubmFtZS50ZXh0ID09PSAndHlwZSc7XG59XG5cbi8vIENoZWNrIGlmIGFuIGlkZW50aWZpZXIgaXMgcGFydCBvZiB0aGUga25vd24gQW5ndWxhciBNZXRhZGF0YS5cbmZ1bmN0aW9uIGlkZW50aWZpZXJJc01ldGFkYXRhKFxuICBpZDogdHMuSWRlbnRpZmllcixcbiAgbWV0YWRhdGE6IHRzLk5vZGVbXSxcbiAgY2hlY2tlcjogdHMuVHlwZUNoZWNrZXIsXG4pOiBib29sZWFuIHtcbiAgY29uc3Qgc3ltYm9sID0gY2hlY2tlci5nZXRTeW1ib2xBdExvY2F0aW9uKGlkKTtcbiAgaWYgKCFzeW1ib2wgfHwgIXN5bWJvbC5kZWNsYXJhdGlvbnMgfHwgIXN5bWJvbC5kZWNsYXJhdGlvbnMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHN5bWJvbC5kZWNsYXJhdGlvbnMuc29tZSgoc3BlYykgPT4gbWV0YWRhdGEuaW5jbHVkZXMoc3BlYykpO1xufVxuXG4vLyBGaW5kIGFsbCBuYW1lZCBpbXBvcnRzIGZvciBgdHNsaWJgLlxuZnVuY3Rpb24gZmluZFRzbGliSW1wb3J0cyhub2RlOiB0cy5Ob2RlKTogdHMuTmFtZWRJbXBvcnRzW10ge1xuICBjb25zdCBpbXBvcnRzOiB0cy5OYW1lZEltcG9ydHNbXSA9IFtdO1xuXG4gIHRzLmZvckVhY2hDaGlsZChub2RlLCAoY2hpbGQpID0+IHtcbiAgICBpZiAoXG4gICAgICB0cy5pc0ltcG9ydERlY2xhcmF0aW9uKGNoaWxkKSAmJlxuICAgICAgY2hpbGQubW9kdWxlU3BlY2lmaWVyICYmXG4gICAgICB0cy5pc1N0cmluZ0xpdGVyYWwoY2hpbGQubW9kdWxlU3BlY2lmaWVyKSAmJlxuICAgICAgY2hpbGQubW9kdWxlU3BlY2lmaWVyLnRleHQgPT09ICd0c2xpYicgJiZcbiAgICAgIGNoaWxkLmltcG9ydENsYXVzZT8ubmFtZWRCaW5kaW5ncyAmJlxuICAgICAgdHMuaXNOYW1lZEltcG9ydHMoY2hpbGQuaW1wb3J0Q2xhdXNlPy5uYW1lZEJpbmRpbmdzKVxuICAgICkge1xuICAgICAgaW1wb3J0cy5wdXNoKGNoaWxkLmltcG9ydENsYXVzZS5uYW1lZEJpbmRpbmdzKTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBpbXBvcnRzO1xufVxuXG4vLyBDaGVjayBpZiBhIGZ1bmN0aW9uIGNhbGwgaXMgYSB0c2xpYiBoZWxwZXIuXG5mdW5jdGlvbiBpc1RzbGliSGVscGVyKFxuICBjYWxsRXhwcjogdHMuQ2FsbEV4cHJlc3Npb24sXG4gIGhlbHBlcjogc3RyaW5nLFxuICB0c2xpYkltcG9ydHM6IHRzLk5hbWVkSW1wb3J0c1tdLFxuICBjaGVja2VyOiB0cy5UeXBlQ2hlY2tlcixcbikge1xuICBpZiAoIXRzLmlzSWRlbnRpZmllcihjYWxsRXhwci5leHByZXNzaW9uKSB8fCBjYWxsRXhwci5leHByZXNzaW9uLnRleHQgIT09IGhlbHBlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IHN5bWJvbCA9IGNoZWNrZXIuZ2V0U3ltYm9sQXRMb2NhdGlvbihjYWxsRXhwci5leHByZXNzaW9uKTtcbiAgaWYgKCFzeW1ib2w/LmRlY2xhcmF0aW9ucz8ubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgZm9yIChjb25zdCBkZWMgb2Ygc3ltYm9sLmRlY2xhcmF0aW9ucykge1xuICAgIGlmICh0cy5pc0ltcG9ydFNwZWNpZmllcihkZWMpICYmIHRzbGliSW1wb3J0cy5zb21lKChuYW1lKSA9PiBuYW1lLmVsZW1lbnRzLmluY2x1ZGVzKGRlYykpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgaW5saW5lIGhlbHBlcnMgYHZhciBfX2RlY29yYXRlID0gKHRoaXMuLi5gXG4gICAgaWYgKHRzLmlzVmFyaWFibGVEZWNsYXJhdGlvbihkZWMpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZmFsc2U7XG59XG4iXX0=
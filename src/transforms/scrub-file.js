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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NydWItZmlsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2J1aWxkX29wdGltaXplci9zcmMvdHJhbnNmb3Jtcy9zY3J1Yi1maWxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCwrQ0FBaUM7QUFDakMsb0RBQXdEO0FBRXhELFNBQWdCLGFBQWEsQ0FBQyxPQUFlO0lBQzNDLE1BQU0sT0FBTyxHQUFHO1FBQ2QsWUFBWTtRQUNaLFlBQVk7UUFDWixnQkFBZ0I7UUFDaEIsZ0JBQWdCO1FBQ2hCLG1CQUFtQjtLQUNwQixDQUFDO0lBRUYsT0FBTyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDNUQsQ0FBQztBQVZELHNDQVVDO0FBRUQsU0FBZ0IsaUNBQWlDLENBQy9DLGlCQUEwQjtJQUUxQixPQUFPLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztBQUN2RSxDQUFDO0FBSkQsOEVBSUM7QUFFRCxTQUFTLG9CQUFvQixDQUFDLE9BQStCLEVBQUUsaUJBQTBCO0lBQ3ZGLElBQUksQ0FBQyxPQUFPLEVBQUU7UUFDWixNQUFNLElBQUksS0FBSyxDQUFDLHFEQUFxRCxDQUFDLENBQUM7S0FDeEU7SUFDRCxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsY0FBYyxFQUFFLENBQUM7SUFFekMsT0FBTyxDQUFDLE9BQWlDLEVBQWlDLEVBQUU7UUFDMUUsTUFBTSxXQUFXLEdBQWtDLENBQUMsRUFBaUIsRUFBRSxFQUFFO1lBQ3ZFLE1BQU0sVUFBVSxHQUFHLG1CQUFtQixDQUFDLEVBQUUsRUFBRSxpQkFBaUIsQ0FBQyxDQUFD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TUFBTSxDQUFFLFlBQVksMENBQUUsTUFBTSxDQUFBLEVBQUU7UUFDakMsT0FBTyxLQUFLLENBQUM7S0FDZDtJQUVELEtBQUssTUFBTSxHQUFHLElBQUksTUFBTSxDQUFDLFlBQVksRUFBRTtRQUNyQyxJQUFJLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFO1lBQ3pGLE9BQU8sSUFBSSxDQUFDO1NBQ2I7UUFFRCxvREFBb0Q7UUFDcEQsSUFBSSxFQUFFLENBQUMscUJBQXFCLENBQUMsR0FBRyxDQUFDLEVBQUU7WUFDakMsT0FBTyxJQUFJLENBQUM7U0FDYjtLQUNGO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCAqIGFzIHRzIGZyb20gJ3R5cGVzY3JpcHQnO1xuaW1wb3J0IHsgY29sbGVjdERlZXBOb2RlcyB9IGZyb20gJy4uL2hlbHBlcnMvYXN0LXV0aWxzJztcblxuZXhwb3J0IGZ1bmN0aW9uIHRlc3RTY3J1YkZpbGUoY29udGVudDogc3RyaW5nKSB7XG4gIGNvbnN0IG1hcmtlcnMgPSBbXG4gICAgJ2RlY29yYXRvcnMnLFxuICAgICdfX2RlY29yYXRlJyxcbiAgICAncHJvcERlY29yYXRvcnMnLFxuICAgICdjdG9yUGFyYW1ldGVycycsXG4gICAgJ8m1c2V0Q2xhc3NNZXRhZGF0YScsXG4gIF07XG5cbiAgcmV0dXJuIG1hcmtlcnMuc29tZSgobWFya2VyKSA9PiBjb250ZW50LmluY2x1ZGVzKG1hcmtlcikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlU2NydWJGaWxlVHJhbnNmb3JtZXJGYWN0b3J5KFxuICBpc0FuZ3VsYXJDb3JlRmlsZTogYm9vbGVhbixcbik6IChwcm9ncmFtPzogdHMuUHJvZ3JhbSkgPT4gdHMuVHJhbnNmb3JtZXJGYWN0b3J5PHRzLlNvdXJjZUZpbGU+IHtcbiAgcmV0dXJuIChwcm9ncmFtKSA9PiBzY3J1YkZpbGVUcmFuc2Zvcm1lcihwcm9ncmFtLCBpc0FuZ3VsYXJDb3JlRmlsZSk7XG59XG5cbmZ1bmN0aW9uIHNjcnViRmlsZVRyYW5zZm9ybWVyKHByb2dyYW06IHRzLlByb2dyYW0gfCB1bmRlZmluZWQsIGlzQW5ndWxhckNvcmVGaWxlOiBib29sZWFuKSB7XG4gIGlmICghcHJvZ3JhbSkge1xuICAgIHRocm93IG5ldyBFcnJvcignc2NydWJGaWxlVHJhbnNmb3JtZXIgcmVxdWlyZXMgYSBUeXBlU2NyaXB0IFByb2dyYW0uJyk7XG4gIH1cbiAgY29uc3QgY2hlY2tlciA9IHByb2dyYW0uZ2V0VHlwZUNoZWNrZXIoKTtcblxuICByZXR1cm4gKGNvbnRleHQ6IHRzLlRyYW5zZm9ybWF0aW9uQ29udGV4dCk6IHRzLlRyYW5zZm9ybWVyPHRzLlNvdXJjZUZpbGU+ID0+IHtcbiAgICBjb25zdCB0cmFuc2Zvcm1lcjogdHMuVHJhbnNmb3JtZXI8dHMuU291cmNlRmlsZT4gPSAoc2Y6IHRzLlNvdXJjZUZpbGUpID0+IHtcbiAgICAgIGNvbnN0IG5nTWV0YWRhdGEgPSBmaW5kQW5ndWxhck1ldGFkYXRhKHNmLCBpc0FuZ3VsYXJDb3JlRmlsZSk7XG4gICAgICBjb25zdCB0c2xpYkltcG9ydHMgPSBmaW5kVHNsaWJJbXBvcnRzKHNmKTtcblxuICAgICAgY29uc3Qgbm9kZXM6IHRzLk5vZGVbXSA9IFtdO1xuICAgICAgdHMuZm9yRWFjaENoaWxkKHNmLCBjaGVja05vZGVGb3JEZWNvcmF0b3JzKTtcblxuICAgICAgZnVuY3Rpb24gY2hlY2tOb2RlRm9yRGVjb3JhdG9ycyhub2RlOiB0cy5Ob2RlKTogdm9pZCB7XG4gICAgICAgIGlmICghdHMuaXNFeHByZXNzaW9uU3RhdGVtZW50KG5vZGUpKSB7XG4gICAgICAgICAgcmV0dXJuIHRzLmZvckVhY2hDaGlsZChub2RlLCBjaGVja05vZGVGb3JEZWNvcmF0b3JzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGV4cHJTdG10ID0gbm9kZSBhcyB0cy5FeHByZXNzaW9uU3RhdGVtZW50O1xuICAgICAgICBjb25zdCBpaWZlID0gZ2V0SWlmZVN0YXRlbWVudChleHByU3RtdCk/LmV4cHJlc3Npb247XG4gICAgICAgIC8vIERvIGNoZWNrcyB0aGF0IGRvbid0IG5lZWQgdGhlIHR5cGVjaGVja2VyIGZpcnN0IGFuZCBiYWlsIGVhcmx5LlxuICAgICAgICBpZiAoaXNDdG9yUGFyYW1zQXNzaWdubWVudEV4cHJlc3Npb24oZXhwclN0bXQpKSB7XG4gICAgICAgICAgbm9kZXMucHVzaChub2RlKTtcbiAgICAgICAgfSBlbHNlIGlmIChpaWZlICYmIGlzSXZ5UHJpdmF0ZUNhbGxFeHByZXNzaW9uKGlpZmUsICfJtXNldENsYXNzTWV0YWRhdGEnKSkge1xuICAgICAgICAgIG5vZGVzLnB1c2gobm9kZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgaWlmZSAmJlxuICAgICAgICAgIHRzLmlzQmluYXJ5RXhwcmVzc2lvbihpaWZlKSAmJlxuICAgICAgICAgIGlzSXZ5UHJpdmF0ZUNhbGxFeHByZXNzaW9uKGlpZmUucmlnaHQsICfJtXNldENsYXNzTWV0YWRhdGEnKVxuICAgICAgICApIHtcbiAgICAgICAgICBub2Rlcy5wdXNoKG5vZGUpO1xuICAgICAgICB9IGVsc2UgaWYgKGlzRGVjb3JhdG9yQXNzaWdubWVudEV4cHJlc3Npb24oZXhwclN0bXQpKSB7XG4gICAgICAgICAgbm9kZXMucHVzaCguLi5waWNrRGVjb3JhdGlvbk5vZGVzVG9SZW1vdmUoZXhwclN0bXQsIG5nTWV0YWRhdGEsIGNoZWNrZXIpKTtcbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICBpc0RlY29yYXRlQXNzaWdubWVudEV4cHJlc3Npb24oZXhwclN0bXQsIHRzbGliSW1wb3J0cywgY2hlY2tlcikgfHxcbiAgICAgICAgICBpc0FuZ3VsYXJEZWNvcmF0b3JFeHByZXNzaW9uKGV4cHJTdG10LCBuZ01ldGFkYXRhLCB0c2xpYkltcG9ydHMsIGNoZWNrZXIpXG4gICAgICAgICkge1xuICAgICAgICAgIG5vZGVzLnB1c2goLi4ucGlja0RlY29yYXRlTm9kZXNUb1JlbW92ZShleHByU3RtdCwgdHNsaWJJbXBvcnRzLCBuZ01ldGFkYXRhLCBjaGVja2VyKSk7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNQcm9wRGVjb3JhdG9yQXNzaWdubWVudEV4cHJlc3Npb24oZXhwclN0bXQpKSB7XG4gICAgICAgICAgbm9kZXMucHVzaCguLi5waWNrUHJvcERlY29yYXRpb25Ob2Rlc1RvUmVtb3ZlKGV4cHJTdG10LCBuZ01ldGFkYXRhLCBjaGVja2VyKSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgdmlzaXRvcjogdHMuVmlzaXRvciA9IChub2RlOiB0cy5Ob2RlKTogdHMuVmlzaXRSZXN1bHQ8dHMuTm9kZT4gPT4ge1xuICAgICAgICAvLyBDaGVjayBpZiBub2RlIGlzIGEgc3RhdGVtZW50IHRvIGJlIGRyb3BwZWQuXG4gICAgICAgIGlmIChub2Rlcy5maW5kKChuKSA9PiBuID09PSBub2RlKSkge1xuICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBPdGhlcndpc2UgcmV0dXJuIG5vZGUgYXMgaXMuXG4gICAgICAgIHJldHVybiB0cy52aXNpdEVhY2hDaGlsZChub2RlLCB2aXNpdG9yLCBjb250ZXh0KTtcbiAgICAgIH07XG5cbiAgICAgIHJldHVybiB0cy52aXNpdE5vZGUoc2YsIHZpc2l0b3IpO1xuICAgIH07XG5cbiAgICByZXR1cm4gdHJhbnNmb3JtZXI7XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBlY3Q8VCBleHRlbmRzIHRzLk5vZGU+KG5vZGU6IHRzLk5vZGUsIGtpbmQ6IHRzLlN5bnRheEtpbmQpOiBUIHtcbiAgaWYgKG5vZGUua2luZCAhPT0ga2luZCkge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBub2RlIHR5cGUuJyk7XG4gIH1cblxuICByZXR1cm4gbm9kZSBhcyBUO1xufVxuXG5mdW5jdGlvbiBmaW5kQW5ndWxhck1ldGFkYXRhKG5vZGU6IHRzLk5vZGUsIGlzQW5ndWxhckNvcmVGaWxlOiBib29sZWFuKTogdHMuTm9kZVtdIHtcbiAgbGV0IHNwZWNzOiB0cy5Ob2RlW10gPSBbXTtcbiAgLy8gRmluZCBhbGwgc3BlY2lmaWVycyBmcm9tIGltcG9ydHMgb2YgYEBhbmd1bGFyL2NvcmVgLlxuICB0cy5mb3JFYWNoQ2hpbGQobm9kZSwgKGNoaWxkKSA9PiB7XG4gICAgaWYgKGNoaWxkLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuSW1wb3J0RGVjbGFyYXRpb24pIHtcbiAgICAgIGNvbnN0IGltcG9ydERlY2wgPSBjaGlsZCBhcyB0cy5JbXBvcnREZWNsYXJhdGlvbjtcbiAgICAgIGlmIChpc0FuZ3VsYXJDb3JlSW1wb3J0KGltcG9ydERlY2wsIGlzQW5ndWxhckNvcmVGaWxlKSkge1xuICAgICAgICBzcGVjcy5wdXNoKFxuICAgICAgICAgIC4uLmNvbGxlY3REZWVwTm9kZXM8dHMuSW1wb3J0U3BlY2lmaWVyPihpbXBvcnREZWNsLCB0cy5TeW50YXhLaW5kLkltcG9ydFNwZWNpZmllciksXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcblxuICAvLyBJZiB0aGUgY3VycmVudCBtb2R1bGUgaXMgYSBBbmd1bGFyIGNvcmUgZmlsZSwgd2UgYWxzbyBjb25zaWRlciBhbGwgZGVjbGFyYXRpb25zIGluIGl0IHRvXG4gIC8vIHBvdGVudGlhbGx5IGJlIEFuZ3VsYXIgbWV0YWRhdGEuXG4gIGlmIChpc0FuZ3VsYXJDb3JlRmlsZSkge1xuICAgIGNvbnN0IGxvY2FsRGVjbCA9IGZpbmRBbGxEZWNsYXJhdGlvbnMobm9kZSk7XG4gICAgc3BlY3MgPSBzcGVjcy5jb25jYXQobG9jYWxEZWNsKTtcbiAgfVxuXG4gIHJldHVybiBzcGVjcztcbn1cblxuZnVuY3Rpb24gZmluZEFsbERlY2xhcmF0aW9ucyhub2RlOiB0cy5Ob2RlKTogdHMuVmFyaWFibGVEZWNsYXJhdGlvbltdIHtcbiAgY29uc3Qgbm9kZXM6IHRzLlZhcmlhYmxlRGVjbGFyYXRpb25bXSA9IFtdO1xuICB0cy5mb3JFYWNoQ2hpbGQobm9kZSwgKGNoaWxkKSA9PiB7XG4gICAgaWYgKGNoaWxkLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuVmFyaWFibGVTdGF0ZW1lbnQpIHtcbiAgICAgIGNvbnN0IHZTdG10ID0gY2hpbGQgYXMgdHMuVmFyaWFibGVTdGF0ZW1lbnQ7XG4gICAgICB2U3RtdC5kZWNsYXJhdGlvbkxpc3QuZGVjbGFyYXRpb25zLmZvckVhY2goKGRlY2wpID0+IHtcbiAgICAgICAgaWYgKGRlY2wubmFtZS5raW5kICE9PSB0cy5TeW50YXhLaW5kLklkZW50aWZpZXIpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgbm9kZXMucHVzaChkZWNsKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIG5vZGVzO1xufVxuXG5mdW5jdGlvbiBpc0FuZ3VsYXJDb3JlSW1wb3J0KG5vZGU6IHRzLkltcG9ydERlY2xhcmF0aW9uLCBpc0FuZ3VsYXJDb3JlRmlsZTogYm9vbGVhbik6IGJvb2xlYW4ge1xuICBpZiAoIShub2RlLm1vZHVsZVNwZWNpZmllciAmJiB0cy5pc1N0cmluZ0xpdGVyYWwobm9kZS5tb2R1bGVTcGVjaWZpZXIpKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjb25zdCBpbXBvcnRUZXh0ID0gbm9kZS5tb2R1bGVTcGVjaWZpZXIudGV4dDtcblxuICAvLyBJbXBvcnRzIHRvIGBAYW5ndWxhci9jb3JlYCBhcmUgYWx3YXlzIGNvcmUgaW1wb3J0cy5cbiAgaWYgKGltcG9ydFRleHQgPT09ICdAYW5ndWxhci9jb3JlJykge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLy8gUmVsYXRpdmUgaW1wb3J0cyBmcm9tIGEgQW5ndWxhciBjb3JlIGZpbGUgYXJlIGFsc28gY29yZSBpbXBvcnRzLlxuICBpZiAoaXNBbmd1bGFyQ29yZUZpbGUgJiYgaW1wb3J0VGV4dC5zdGFydHNXaXRoKCcuJykpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIHJldHVybiBmYWxzZTtcbn1cblxuLy8gQ2hlY2sgaWYgYXNzaWdubWVudCBpcyBgQ2xhenouZGVjb3JhdG9ycyA9IFsuLi5dO2AuXG5mdW5jdGlvbiBpc0RlY29yYXRvckFzc2lnbm1lbnRFeHByZXNzaW9uKGV4cHJTdG10OiB0cy5FeHByZXNzaW9uU3RhdGVtZW50KTogYm9vbGVhbiB7XG4gIGlmICghaXNBc3NpZ25tZW50RXhwcmVzc2lvblRvKGV4cHJTdG10LCAnZGVjb3JhdG9ycycpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IGV4cHIgPSBleHByU3RtdC5leHByZXNzaW9uIGFzIHRzLkJpbmFyeUV4cHJlc3Npb247XG4gIGlmICghdHMuaXNBcnJheUxpdGVyYWxFeHByZXNzaW9uKGV4cHIucmlnaHQpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIENoZWNrIGlmIGFzc2lnbm1lbnQgaXMgYENsYXp6ID0gX19kZWNvcmF0ZShbLi4uXSwgQ2xhenopYC5cbmZ1bmN0aW9uIGlzRGVjb3JhdGVBc3NpZ25tZW50RXhwcmVzc2lvbihcbiAgZXhwclN0bXQ6IHRzLkV4cHJlc3Npb25TdGF0ZW1lbnQsXG4gIHRzbGliSW1wb3J0czogdHMuTmFtZWRJbXBvcnRzW10sXG4gIGNoZWNrZXI6IHRzLlR5cGVDaGVja2VyLFxuKTogYm9vbGVhbiB7XG4gIGlmICghdHMuaXNCaW5hcnlFeHByZXNzaW9uKGV4cHJTdG10LmV4cHJlc3Npb24pKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IGV4cHIgPSBleHByU3RtdC5leHByZXNzaW9uO1xuICBpZiAoIXRzLmlzSWRlbnRpZmllcihleHByLmxlZnQpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IGNsYXNzSWRlbnQgPSBleHByLmxlZnQ7XG4gIGxldCBjYWxsRXhwcjogdHMuQ2FsbEV4cHJlc3Npb247XG5cbiAgaWYgKHRzLmlzQ2FsbEV4cHJlc3Npb24oZXhwci5yaWdodCkpIHtcbiAgICBjYWxsRXhwciA9IGV4cHIucmlnaHQ7XG4gIH0gZWxzZSBpZiAodHMuaXNCaW5hcnlFeHByZXNzaW9uKGV4cHIucmlnaHQpKSB7XG4gICAgLy8gYENsYXp6ID0gQ2xhenpfMSA9IF9fZGVjb3JhdGUoWy4uLl0sIENsYXp6KWAgY2FuIGJlIGZvdW5kIHdoZW4gdGhlcmUgYXJlIHN0YXRpYyBwcm9wZXJ0eVxuICAgIC8vIGFjY2Vzc2VzLlxuICAgIGNvbnN0IGlubmVyRXhwciA9IGV4cHIucmlnaHQ7XG4gICAgaWYgKCF0cy5pc0lkZW50aWZpZXIoaW5uZXJFeHByLmxlZnQpIHx8ICF0cy5pc0NhbGxFeHByZXNzaW9uKGlubmVyRXhwci5yaWdodCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY2FsbEV4cHIgPSBpbm5lckV4cHIucmlnaHQ7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKCFpc1RzbGliSGVscGVyKGNhbGxFeHByLCAnX19kZWNvcmF0ZScsIHRzbGliSW1wb3J0cywgY2hlY2tlcikpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoY2FsbEV4cHIuYXJndW1lbnRzLmxlbmd0aCAhPT0gMikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IGNsYXNzQXJnID0gY2FsbEV4cHIuYXJndW1lbnRzWzFdO1xuICBpZiAoIXRzLmlzSWRlbnRpZmllcihjbGFzc0FyZykpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoY2xhc3NJZGVudC50ZXh0ICE9PSBjbGFzc0FyZy50ZXh0KSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICghdHMuaXNBcnJheUxpdGVyYWxFeHByZXNzaW9uKGNhbGxFeHByLmFyZ3VtZW50c1swXSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gQ2hlY2sgaWYgZXhwcmVzc2lvbiBpcyBgX19kZWNvcmF0ZShbc210LCBfX21ldGFkYXRhKFwiZGVzaWduOnR5cGVcIiwgT2JqZWN0KV0sIC4uLilgLlxuZnVuY3Rpb24gaXNBbmd1bGFyRGVjb3JhdG9yRXhwcmVzc2lvbihcbiAgZXhwclN0bXQ6IHRzLkV4cHJlc3Npb25TdGF0ZW1lbnQsXG4gIG5nTWV0YWRhdGE6IHRzLk5vZGVbXSxcbiAgdHNsaWJJbXBvcnRzOiB0cy5OYW1lZEltcG9ydHNbXSxcbiAgY2hlY2tlcjogdHMuVHlwZUNoZWNrZXIsXG4pOiBib29sZWFuIHtcbiAgaWYgKCF0cy5pc0NhbGxFeHByZXNzaW9uKGV4cHJTdG10LmV4cHJlc3Npb24pKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IGNhbGxFeHByID0gZXhwclN0bXQuZXhwcmVzc2lvbjtcbiAgaWYgKCFpc1RzbGliSGVscGVyKGNhbGxFeHByLCAnX19kZWNvcmF0ZScsIHRzbGliSW1wb3J0cywgY2hlY2tlcikpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGNhbGxFeHByLmFyZ3VtZW50cy5sZW5ndGggIT09IDQpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY29uc3QgZGVjb3JhdGVBcnJheSA9IGNhbGxFeHByLmFyZ3VtZW50c1swXTtcbiAgaWYgKCF0cy5pc0FycmF5TGl0ZXJhbEV4cHJlc3Npb24oZGVjb3JhdGVBcnJheSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgLy8gQ2hlY2sgZmlyc3QgYXJyYXkgZW50cnkgZm9yIEFuZ3VsYXIgZGVjb3JhdG9ycy5cbiAgaWYgKGRlY29yYXRlQXJyYXkuZWxlbWVudHMubGVuZ3RoID09PSAwIHx8ICF0cy5pc0NhbGxFeHByZXNzaW9uKGRlY29yYXRlQXJyYXkuZWxlbWVudHNbMF0pKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIGRlY29yYXRlQXJyYXkuZWxlbWVudHMuc29tZSgoZGVjb3JhdG9yQ2FsbCkgPT4ge1xuICAgIGlmICghdHMuaXNDYWxsRXhwcmVzc2lvbihkZWNvcmF0b3JDYWxsKSB8fCAhdHMuaXNJZGVudGlmaWVyKGRlY29yYXRvckNhbGwuZXhwcmVzc2lvbikpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCBkZWNvcmF0b3JJZCA9IGRlY29yYXRvckNhbGwuZXhwcmVzc2lvbjtcblxuICAgIHJldHVybiBpZGVudGlmaWVySXNNZXRhZGF0YShkZWNvcmF0b3JJZCwgbmdNZXRhZGF0YSwgY2hlY2tlcik7XG4gIH0pO1xufVxuXG4vLyBDaGVjayBpZiBhc3NpZ25tZW50IGlzIGBDbGF6ei5wcm9wRGVjb3JhdG9ycyA9IFsuLi5dO2AuXG5mdW5jdGlvbiBpc1Byb3BEZWNvcmF0b3JBc3NpZ25tZW50RXhwcmVzc2lvbihleHByU3RtdDogdHMuRXhwcmVzc2lvblN0YXRlbWVudCk6IGJvb2xlYW4ge1xuICBpZiAoIWlzQXNzaWdubWVudEV4cHJlc3Npb25UbyhleHByU3RtdCwgJ3Byb3BEZWNvcmF0b3JzJykpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY29uc3QgZXhwciA9IGV4cHJTdG10LmV4cHJlc3Npb24gYXMgdHMuQmluYXJ5RXhwcmVzc2lvbjtcbiAgaWYgKGV4cHIucmlnaHQua2luZCAhPT0gdHMuU3ludGF4S2luZC5PYmplY3RMaXRlcmFsRXhwcmVzc2lvbikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyBDaGVjayBpZiBhc3NpZ25tZW50IGlzIGBDbGF6ei5jdG9yUGFyYW1ldGVycyA9IFsuLi5dO2AuXG5mdW5jdGlvbiBpc0N0b3JQYXJhbXNBc3NpZ25tZW50RXhwcmVzc2lvbihleHByU3RtdDogdHMuRXhwcmVzc2lvblN0YXRlbWVudCk6IGJvb2xlYW4ge1xuICBpZiAoIWlzQXNzaWdubWVudEV4cHJlc3Npb25UbyhleHByU3RtdCwgJ2N0b3JQYXJhbWV0ZXJzJykpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY29uc3QgZXhwciA9IGV4cHJTdG10LmV4cHJlc3Npb24gYXMgdHMuQmluYXJ5RXhwcmVzc2lvbjtcbiAgaWYgKFxuICAgIGV4cHIucmlnaHQua2luZCAhPT0gdHMuU3ludGF4S2luZC5GdW5jdGlvbkV4cHJlc3Npb24gJiZcbiAgICBleHByLnJpZ2h0LmtpbmQgIT09IHRzLlN5bnRheEtpbmQuQXJyb3dGdW5jdGlvblxuICApIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaXNBc3NpZ25tZW50RXhwcmVzc2lvblRvKGV4cHJTdG10OiB0cy5FeHByZXNzaW9uU3RhdGVtZW50LCBuYW1lOiBzdHJpbmcpIHtcbiAgaWYgKCF0cy5pc0JpbmFyeUV4cHJlc3Npb24oZXhwclN0bXQuZXhwcmVzc2lvbikpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY29uc3QgZXhwciA9IGV4cHJTdG10LmV4cHJlc3Npb247XG4gIGlmICghdHMuaXNQcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24oZXhwci5sZWZ0KSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjb25zdCBwcm9wQWNjZXNzID0gZXhwci5sZWZ0O1xuICBpZiAocHJvcEFjY2Vzcy5uYW1lLnRleHQgIT09IG5hbWUpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKCF0cy5pc0lkZW50aWZpZXIocHJvcEFjY2Vzcy5leHByZXNzaW9uKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoZXhwci5vcGVyYXRvclRva2VuLmtpbmQgIT09IHRzLlN5bnRheEtpbmQuRmlyc3RBc3NpZ25tZW50KSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIEVhY2ggSXZ5IHByaXZhdGUgY2FsbCBleHByZXNzaW9uIGlzIGluc2lkZSBhbiBJSUZFXG5mdW5jdGlvbiBnZXRJaWZlU3RhdGVtZW50KGV4cHJTdG10OiB0cy5FeHByZXNzaW9uU3RhdGVtZW50KTogbnVsbCB8IHRzLkV4cHJlc3Npb25TdGF0ZW1lbnQge1xuICBjb25zdCBleHByZXNzaW9uID0gZXhwclN0bXQuZXhwcmVzc2lvbjtcbiAgaWYgKCFleHByZXNzaW9uIHx8ICF0cy5pc0NhbGxFeHByZXNzaW9uKGV4cHJlc3Npb24pIHx8IGV4cHJlc3Npb24uYXJndW1lbnRzLmxlbmd0aCAhPT0gMCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgcGFyZW5FeHByID0gZXhwcmVzc2lvbjtcbiAgaWYgKCF0cy5pc1BhcmVudGhlc2l6ZWRFeHByZXNzaW9uKHBhcmVuRXhwci5leHByZXNzaW9uKSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgZnVuRXhwciA9IHBhcmVuRXhwci5leHByZXNzaW9uLmV4cHJlc3Npb247XG4gIGlmICghdHMuaXNGdW5jdGlvbkV4cHJlc3Npb24oZnVuRXhwcikpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGNvbnN0IGlubmVyU3RtdHMgPSBmdW5FeHByLmJvZHkuc3RhdGVtZW50cztcbiAgaWYgKGlubmVyU3RtdHMubGVuZ3RoICE9PSAxKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBpbm5lckV4cHJTdG10ID0gaW5uZXJTdG10c1swXTtcbiAgaWYgKCF0cy5pc0V4cHJlc3Npb25TdGF0ZW1lbnQoaW5uZXJFeHByU3RtdCkpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHJldHVybiBpbm5lckV4cHJTdG10O1xufVxuXG5mdW5jdGlvbiBpc0l2eVByaXZhdGVDYWxsRXhwcmVzc2lvbihleHByZXNzaW9uOiB0cy5FeHByZXNzaW9uLCBuYW1lOiBzdHJpbmcpIHtcbiAgLy8gTm93IHdlJ3JlIGluIHRoZSBJSUZFIGFuZCBoYXZlIHRoZSBpbm5lciBleHByZXNzaW9uIHN0YXRlbWVudC4gV2UgY2FuIGNoZWNrIGlmIGl0IG1hdGNoZXNcbiAgLy8gYSBwcml2YXRlIEl2eSBjYWxsLlxuICBpZiAoIXRzLmlzQ2FsbEV4cHJlc3Npb24oZXhwcmVzc2lvbikpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBjb25zdCBwcm9wQWNjRXhwciA9IGV4cHJlc3Npb24uZXhwcmVzc2lvbjtcbiAgaWYgKCF0cy5pc1Byb3BlcnR5QWNjZXNzRXhwcmVzc2lvbihwcm9wQWNjRXhwcikpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAocHJvcEFjY0V4cHIubmFtZS50ZXh0ICE9IG5hbWUpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gUmVtb3ZlIEFuZ3VsYXIgZGVjb3JhdG9ycyBmcm9tYENsYXp6LmRlY29yYXRvcnMgPSBbLi4uXTtgLCBvciBleHByZXNzaW9uIGl0c2VsZiBpZiBhbGwgYXJlXG4vLyByZW1vdmVkLlxuZnVuY3Rpb24gcGlja0RlY29yYXRpb25Ob2Rlc1RvUmVtb3ZlKFxuICBleHByU3RtdDogdHMuRXhwcmVzc2lvblN0YXRlbWVudCxcbiAgbmdNZXRhZGF0YTogdHMuTm9kZVtdLFxuICBjaGVja2VyOiB0cy5UeXBlQ2hlY2tlcixcbik6IHRzLk5vZGVbXSB7XG4gIGNvbnN0IGV4cHIgPSBleHBlY3Q8dHMuQmluYXJ5RXhwcmVzc2lvbj4oZXhwclN0bXQuZXhwcmVzc2lvbiwgdHMuU3ludGF4S2luZC5CaW5hcnlFeHByZXNzaW9uKTtcbiAgY29uc3QgbGl0ZXJhbCA9IGV4cGVjdDx0cy5BcnJheUxpdGVyYWxFeHByZXNzaW9uPihcbiAgICBleHByLnJpZ2h0LFxuICAgIHRzLlN5bnRheEtpbmQuQXJyYXlMaXRlcmFsRXhwcmVzc2lvbixcbiAgKTtcbiAgaWYgKCFsaXRlcmFsLmVsZW1lbnRzLmV2ZXJ5KChlbGVtKSA9PiB0cy5pc09iamVjdExpdGVyYWxFeHByZXNzaW9uKGVsZW0pKSkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuICBjb25zdCBlbGVtZW50cyA9IGxpdGVyYWwuZWxlbWVudHMgYXMgdHMuTm9kZUFycmF5PHRzLk9iamVjdExpdGVyYWxFeHByZXNzaW9uPjtcbiAgY29uc3QgbmdEZWNvcmF0b3JzID0gZWxlbWVudHMuZmlsdGVyKChlbGVtKSA9PiBpc0FuZ3VsYXJEZWNvcmF0b3IoZWxlbSwgbmdNZXRhZGF0YSwgY2hlY2tlcikpO1xuXG4gIHJldHVybiBlbGVtZW50cy5sZW5ndGggPiBuZ0RlY29yYXRvcnMubGVuZ3RoID8gbmdEZWNvcmF0b3JzIDogW2V4cHJTdG10XTtcbn1cblxuLy8gUmVtb3ZlIEFuZ3VsYXIgZGVjb3JhdG9ycyBmcm9tIGBDbGF6eiA9IF9fZGVjb3JhdGUoWy4uLl0sIENsYXp6KWAsIG9yIGV4cHJlc3Npb24gaXRzZWxmIGlmIGFsbFxuLy8gYXJlIHJlbW92ZWQuXG5mdW5jdGlvbiBwaWNrRGVjb3JhdGVOb2Rlc1RvUmVtb3ZlKFxuICBleHByU3RtdDogdHMuRXhwcmVzc2lvblN0YXRlbWVudCxcbiAgdHNsaWJJbXBvcnRzOiB0cy5OYW1lZEltcG9ydHNbXSxcbiAgbmdNZXRhZGF0YTogdHMuTm9kZVtdLFxuICBjaGVja2VyOiB0cy5UeXBlQ2hlY2tlcixcbik6IHRzLk5vZGVbXSB7XG4gIGxldCBjYWxsRXhwcjogdHMuQ2FsbEV4cHJlc3Npb24gfCB1bmRlZmluZWQ7XG4gIGlmICh0cy5pc0NhbGxFeHByZXNzaW9uKGV4cHJTdG10LmV4cHJlc3Npb24pKSB7XG4gICAgY2FsbEV4cHIgPSBleHByU3RtdC5leHByZXNzaW9uO1xuICB9IGVsc2UgaWYgKHRzLmlzQmluYXJ5RXhwcmVzc2lvbihleHByU3RtdC5leHByZXNzaW9uKSkge1xuICAgIGNvbnN0IGV4cHIgPSBleHByU3RtdC5leHByZXNzaW9uO1xuICAgIGlmICh0cy5pc0NhbGxFeHByZXNzaW9uKGV4cHIucmlnaHQpKSB7XG4gICAgICBjYWxsRXhwciA9IGV4cHIucmlnaHQ7XG4gICAgfSBlbHNlIGlmICh0cy5pc0JpbmFyeUV4cHJlc3Npb24oZXhwci5yaWdodCkgJiYgdHMuaXNDYWxsRXhwcmVzc2lvbihleHByLnJpZ2h0LnJpZ2h0KSkge1xuICAgICAgY2FsbEV4cHIgPSBleHByLnJpZ2h0LnJpZ2h0O1xuICAgIH1cbiAgfVxuXG4gIGlmICghY2FsbEV4cHIpIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICBjb25zdCBhcnJMaXRlcmFsID0gZXhwZWN0PHRzLkFycmF5TGl0ZXJhbEV4cHJlc3Npb24+KFxuICAgIGNhbGxFeHByLmFyZ3VtZW50c1swXSxcbiAgICB0cy5TeW50YXhLaW5kLkFycmF5TGl0ZXJhbEV4cHJlc3Npb24sXG4gICk7XG5cbiAgaWYgKCFhcnJMaXRlcmFsLmVsZW1lbnRzLmV2ZXJ5KChlbGVtKSA9PiB0cy5pc0NhbGxFeHByZXNzaW9uKGVsZW0pKSkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuICBjb25zdCBlbGVtZW50cyA9IGFyckxpdGVyYWwuZWxlbWVudHMgYXMgdHMuTm9kZUFycmF5PHRzLkNhbGxFeHByZXNzaW9uPjtcbiAgY29uc3QgbmdEZWNvcmF0b3JDYWxscyA9IGVsZW1lbnRzLmZpbHRlcigoZWwpID0+IHtcbiAgICBpZiAoIXRzLmlzSWRlbnRpZmllcihlbC5leHByZXNzaW9uKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiBpZGVudGlmaWVySXNNZXRhZGF0YShlbC5leHByZXNzaW9uLCBuZ01ldGFkYXRhLCBjaGVja2VyKTtcbiAgfSk7XG5cbiAgLy8gUmVtb3ZlIF9fbWV0YWRhdGEgY2FsbHMgb2YgdHlwZSAnZGVzaWduOnBhcmFtdHlwZXMnLlxuICBjb25zdCBtZXRhZGF0YUNhbGxzID0gZWxlbWVudHMuZmlsdGVyKChlbCkgPT4ge1xuICAgIGlmICghaXNUc2xpYkhlbHBlcihlbCwgJ19fbWV0YWRhdGEnLCB0c2xpYkltcG9ydHMsIGNoZWNrZXIpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKGVsLmFyZ3VtZW50cy5sZW5ndGggPCAyIHx8ICF0cy5pc1N0cmluZ0xpdGVyYWwoZWwuYXJndW1lbnRzWzBdKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9KTtcbiAgLy8gUmVtb3ZlIGFsbCBfX3BhcmFtIGNhbGxzLlxuICBjb25zdCBwYXJhbUNhbGxzID0gZWxlbWVudHMuZmlsdGVyKChlbCkgPT4ge1xuICAgIGlmICghaXNUc2xpYkhlbHBlcihlbCwgJ19fcGFyYW0nLCB0c2xpYkltcG9ydHMsIGNoZWNrZXIpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKGVsLmFyZ3VtZW50cy5sZW5ndGggIT09IDIgfHwgIXRzLmlzTnVtZXJpY0xpdGVyYWwoZWwuYXJndW1lbnRzWzBdKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxuICBpZiAobmdEZWNvcmF0b3JDYWxscy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICBjb25zdCBjYWxsQ291bnQgPSBuZ0RlY29yYXRvckNhbGxzLmxlbmd0aCArIG1ldGFkYXRhQ2FsbHMubGVuZ3RoICsgcGFyYW1DYWxscy5sZW5ndGg7XG5cbiAgLy8gSWYgYWxsIGRlY29yYXRvcnMgYXJlIG1ldGFkYXRhIGRlY29yYXRvcnMgdGhlbiByZXR1cm4gdGhlIHdob2xlIGBDbGFzcyA9IF9fZGVjb3JhdGUoWy4uLl0pJ2BcbiAgLy8gc3RhdGVtZW50IHNvIHRoYXQgaXQgaXMgcmVtb3ZlZCBpbiBlbnRpcmV0eS5cbiAgLy8gSWYgbm90IHRoZW4gb25seSByZW1vdmUgdGhlIEFuZ3VsYXIgZGVjb3JhdG9ycy5cbiAgLy8gVGhlIG1ldGFkYXRhIGFuZCBwYXJhbSBjYWxscyBtYXkgYmUgdXNlZCBieSB0aGUgbm9uLUFuZ3VsYXIgZGVjb3JhdG9ycy5cbiAgcmV0dXJuIGVsZW1lbnRzLmxlbmd0aCA9PT0gY2FsbENvdW50ID8gW2V4cHJTdG10XSA6IG5nRGVjb3JhdG9yQ2FsbHM7XG59XG5cbi8vIFJlbW92ZSBBbmd1bGFyIGRlY29yYXRvcnMgZnJvbWBDbGF6ei5wcm9wRGVjb3JhdG9ycyA9IFsuLi5dO2AsIG9yIGV4cHJlc3Npb24gaXRzZWxmIGlmIGFsbFxuLy8gYXJlIHJlbW92ZWQuXG5mdW5jdGlvbiBwaWNrUHJvcERlY29yYXRpb25Ob2Rlc1RvUmVtb3ZlKFxuICBleHByU3RtdDogdHMuRXhwcmVzc2lvblN0YXRlbWVudCxcbiAgbmdNZXRhZGF0YTogdHMuTm9kZVtdLFxuICBjaGVja2VyOiB0cy5UeXBlQ2hlY2tlcixcbik6IHRzLk5vZGVbXSB7XG4gIGNvbnN0IGV4cHIgPSBleHBlY3Q8dHMuQmluYXJ5RXhwcmVzc2lvbj4oZXhwclN0bXQuZXhwcmVzc2lvbiwgdHMuU3ludGF4S2luZC5CaW5hcnlFeHByZXNzaW9uKTtcbiAgY29uc3QgbGl0ZXJhbCA9IGV4cGVjdDx0cy5PYmplY3RMaXRlcmFsRXhwcmVzc2lvbj4oXG4gICAgZXhwci5yaWdodCxcbiAgICB0cy5TeW50YXhLaW5kLk9iamVjdExpdGVyYWxFeHByZXNzaW9uLFxuICApO1xuICBpZiAoXG4gICAgIWxpdGVyYWwucHJvcGVydGllcy5ldmVyeShcbiAgICAgIChlbGVtKSA9PiB0cy5pc1Byb3BlcnR5QXNzaWdubWVudChlbGVtKSAmJiB0cy5pc0FycmF5TGl0ZXJhbEV4cHJlc3Npb24oZWxlbS5pbml0aWFsaXplciksXG4gICAgKVxuICApIHtcbiAgICByZXR1cm4gW107XG4gIH1cbiAgY29uc3QgYXNzaWdubWVudHMgPSBsaXRlcmFsLnByb3BlcnRpZXMgYXMgdHMuTm9kZUFycmF5PHRzLlByb3BlcnR5QXNzaWdubWVudD47XG4gIC8vIENvbnNpZGVyIGVhY2ggYXNzaWdubWVudCBpbmRpdmlkdWFsbHkuIEVpdGhlciB0aGUgd2hvbGUgYXNzaWdubWVudCB3aWxsIGJlIHJlbW92ZWQgb3JcbiAgLy8gYSBwYXJ0aWN1bGFyIGRlY29yYXRvciB3aXRoaW4gd2lsbC5cbiAgY29uc3QgdG9SZW1vdmUgPSBhc3NpZ25tZW50c1xuICAgIC5tYXAoKGFzc2lnbikgPT4ge1xuICAgICAgY29uc3QgZGVjb3JhdG9ycyA9IGV4cGVjdDx0cy5BcnJheUxpdGVyYWxFeHByZXNzaW9uPihcbiAgICAgICAgYXNzaWduLmluaXRpYWxpemVyLFxuICAgICAgICB0cy5TeW50YXhLaW5kLkFycmF5TGl0ZXJhbEV4cHJlc3Npb24sXG4gICAgICApLmVsZW1lbnRzO1xuICAgICAgaWYgKCFkZWNvcmF0b3JzLmV2ZXJ5KChlbCkgPT4gdHMuaXNPYmplY3RMaXRlcmFsRXhwcmVzc2lvbihlbCkpKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGRlY3NUb1JlbW92ZSA9IGRlY29yYXRvcnMuZmlsdGVyKChleHByZXNzaW9uKSA9PiB7XG4gICAgICAgIGNvbnN0IGxpdCA9IGV4cGVjdDx0cy5PYmplY3RMaXRlcmFsRXhwcmVzc2lvbj4oXG4gICAgICAgICAgZXhwcmVzc2lvbixcbiAgICAgICAgICB0cy5TeW50YXhLaW5kLk9iamVjdExpdGVyYWxFeHByZXNzaW9uLFxuICAgICAgICApO1xuXG4gICAgICAgIHJldHVybiBpc0FuZ3VsYXJEZWNvcmF0b3IobGl0LCBuZ01ldGFkYXRhLCBjaGVja2VyKTtcbiAgICAgIH0pO1xuICAgICAgaWYgKGRlY3NUb1JlbW92ZS5sZW5ndGggPT09IGRlY29yYXRvcnMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBbYXNzaWduXTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGRlY3NUb1JlbW92ZTtcbiAgICB9KVxuICAgIC5yZWR1Y2UoKGFjY3VtLCB0b1JtKSA9PiBhY2N1bS5jb25jYXQodG9SbSksIFtdIGFzIHRzLk5vZGVbXSk7XG4gIC8vIElmIGV2ZXJ5IG5vZGUgdG8gYmUgcmVtb3ZlZCBpcyBhIHByb3BlcnR5IGFzc2lnbm1lbnQgKGZ1bGwgcHJvcGVydHkncyBkZWNvcmF0b3JzKSBhbmRcbiAgLy8gYWxsIHByb3BlcnRpZXMgYXJlIGFjY291bnRlZCBmb3IsIHJlbW92ZSB0aGUgd2hvbGUgYXNzaWdubWVudC4gT3RoZXJ3aXNlLCByZW1vdmUgdGhlXG4gIC8vIG5vZGVzIHdoaWNoIHdlcmUgbWFya2VkIGFzIHNhZmUuXG4gIGlmIChcbiAgICB0b1JlbW92ZS5sZW5ndGggPT09IGFzc2lnbm1lbnRzLmxlbmd0aCAmJlxuICAgIHRvUmVtb3ZlLmV2ZXJ5KChub2RlKSA9PiB0cy5pc1Byb3BlcnR5QXNzaWdubWVudChub2RlKSlcbiAgKSB7XG4gICAgcmV0dXJuIFtleHByU3RtdF07XG4gIH1cblxuICByZXR1cm4gdG9SZW1vdmU7XG59XG5cbmZ1bmN0aW9uIGlzQW5ndWxhckRlY29yYXRvcihcbiAgbGl0ZXJhbDogdHMuT2JqZWN0TGl0ZXJhbEV4cHJlc3Npb24sXG4gIG5nTWV0YWRhdGE6IHRzLk5vZGVbXSxcbiAgY2hlY2tlcjogdHMuVHlwZUNoZWNrZXIsXG4pOiBib29sZWFuIHtcbiAgY29uc3QgdHlwZXMgPSBsaXRlcmFsLnByb3BlcnRpZXMuZmlsdGVyKGlzVHlwZVByb3BlcnR5KTtcbiAgaWYgKHR5cGVzLmxlbmd0aCAhPT0gMSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjb25zdCBhc3NpZ24gPSBleHBlY3Q8dHMuUHJvcGVydHlBc3NpZ25tZW50Pih0eXBlc1swXSwgdHMuU3ludGF4S2luZC5Qcm9wZXJ0eUFzc2lnbm1lbnQpO1xuICBpZiAoIXRzLmlzSWRlbnRpZmllcihhc3NpZ24uaW5pdGlhbGl6ZXIpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IGlkID0gYXNzaWduLmluaXRpYWxpemVyO1xuICBjb25zdCByZXMgPSBpZGVudGlmaWVySXNNZXRhZGF0YShpZCwgbmdNZXRhZGF0YSwgY2hlY2tlcik7XG5cbiAgcmV0dXJuIHJlcztcbn1cblxuZnVuY3Rpb24gaXNUeXBlUHJvcGVydHkocHJvcDogdHMuT2JqZWN0TGl0ZXJhbEVsZW1lbnQpOiBib29sZWFuIHtcbiAgaWYgKCF0cy5pc1Byb3BlcnR5QXNzaWdubWVudChwcm9wKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmICghdHMuaXNJZGVudGlmaWVyKHByb3AubmFtZSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gcHJvcC5uYW1lLnRleHQgPT09ICd0eXBlJztcbn1cblxuLy8gQ2hlY2sgaWYgYW4gaWRlbnRpZmllciBpcyBwYXJ0IG9mIHRoZSBrbm93biBBbmd1bGFyIE1ldGFkYXRhLlxuZnVuY3Rpb24gaWRlbnRpZmllcklzTWV0YWRhdGEoXG4gIGlkOiB0cy5JZGVudGlmaWVyLFxuICBtZXRhZGF0YTogdHMuTm9kZVtdLFxuICBjaGVja2VyOiB0cy5UeXBlQ2hlY2tlcixcbik6IGJvb2xlYW4ge1xuICBjb25zdCBzeW1ib2wgPSBjaGVja2VyLmdldFN5bWJvbEF0TG9jYXRpb24oaWQpO1xuICBpZiAoIXN5bWJvbCB8fCAhc3ltYm9sLmRlY2xhcmF0aW9ucyB8fCAhc3ltYm9sLmRlY2xhcmF0aW9ucy5sZW5ndGgpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gc3ltYm9sLmRlY2xhcmF0aW9ucy5zb21lKChzcGVjKSA9PiBtZXRhZGF0YS5pbmNsdWRlcyhzcGVjKSk7XG59XG5cbi8vIEZpbmQgYWxsIG5hbWVkIGltcG9ydHMgZm9yIGB0c2xpYmAuXG5mdW5jdGlvbiBmaW5kVHNsaWJJbXBvcnRzKG5vZGU6IHRzLk5vZGUpOiB0cy5OYW1lZEltcG9ydHNbXSB7XG4gIGNvbnN0IGltcG9ydHM6IHRzLk5hbWVkSW1wb3J0c1tdID0gW107XG5cbiAgdHMuZm9yRWFjaENoaWxkKG5vZGUsIChjaGlsZCkgPT4ge1xuICAgIGlmIChcbiAgICAgIHRzLmlzSW1wb3J0RGVjbGFyYXRpb24oY2hpbGQpICYmXG4gICAgICBjaGlsZC5tb2R1bGVTcGVjaWZpZXIgJiZcbiAgICAgIHRzLmlzU3RyaW5nTGl0ZXJhbChjaGlsZC5tb2R1bGVTcGVjaWZpZXIpICYmXG4gICAgICBjaGlsZC5tb2R1bGVTcGVjaWZpZXIudGV4dCA9PT0gJ3RzbGliJyAmJlxuICAgICAgY2hpbGQuaW1wb3J0Q2xhdXNlPy5uYW1lZEJpbmRpbmdzICYmXG4gICAgICB0cy5pc05hbWVkSW1wb3J0cyhjaGlsZC5pbXBvcnRDbGF1c2U/Lm5hbWVkQmluZGluZ3MpXG4gICAgKSB7XG4gICAgICBpbXBvcnRzLnB1c2goY2hpbGQuaW1wb3J0Q2xhdXNlLm5hbWVkQmluZGluZ3MpO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIGltcG9ydHM7XG59XG5cbi8vIENoZWNrIGlmIGEgZnVuY3Rpb24gY2FsbCBpcyBhIHRzbGliIGhlbHBlci5cbmZ1bmN0aW9uIGlzVHNsaWJIZWxwZXIoXG4gIGNhbGxFeHByOiB0cy5DYWxsRXhwcmVzc2lvbixcbiAgaGVscGVyOiBzdHJpbmcsXG4gIHRzbGliSW1wb3J0czogdHMuTmFtZWRJbXBvcnRzW10sXG4gIGNoZWNrZXI6IHRzLlR5cGVDaGVja2VyLFxuKSB7XG4gIGlmICghdHMuaXNJZGVudGlmaWVyKGNhbGxFeHByLmV4cHJlc3Npb24pIHx8IGNhbGxFeHByLmV4cHJlc3Npb24udGV4dCAhPT0gaGVscGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3Qgc3ltYm9sID0gY2hlY2tlci5nZXRTeW1ib2xBdExvY2F0aW9uKGNhbGxFeHByLmV4cHJlc3Npb24pO1xuICBpZiAoIXN5bWJvbD8uZGVjbGFyYXRpb25zPy5sZW5ndGgpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBmb3IgKGNvbnN0IGRlYyBvZiBzeW1ib2wuZGVjbGFyYXRpb25zKSB7XG4gICAgaWYgKHRzLmlzSW1wb3J0U3BlY2lmaWVyKGRlYykgJiYgdHNsaWJJbXBvcnRzLnNvbWUoKG5hbWUpID0+IG5hbWUuZWxlbWVudHMuaW5jbHVkZXMoZGVjKSkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8vIEhhbmRsZSBpbmxpbmUgaGVscGVycyBgdmFyIF9fZGVjb3JhdGUgPSAodGhpcy4uLmBcbiAgICBpZiAodHMuaXNWYXJpYWJsZURlY2xhcmF0aW9uKGRlYykpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBmYWxzZTtcbn1cbiJdfQ==
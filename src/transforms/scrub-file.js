"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
const ts = require("typescript");
const ast_utils_1 = require("../helpers/ast-utils");
function testScrubFile(content) {
    const markers = [
        'decorators',
        '__decorate',
        'propDecorators',
        'ctorParameters',
    ];
    return markers.some((marker) => content.indexOf(marker) !== -1);
}
exports.testScrubFile = testScrubFile;
// Don't remove `ctorParameters` from these.
const platformWhitelist = [
    'PlatformRef_',
    'TestabilityRegistry',
    'Console',
    'BrowserPlatformLocation',
];
const angularSpecifiers = [
    // Class level decorators.
    'Component',
    'Directive',
    'Injectable',
    'NgModule',
    'Pipe',
    // Property level decorators.
    'ContentChild',
    'ContentChildren',
    'HostBinding',
    'HostListener',
    'Input',
    'Output',
    'ViewChild',
    'ViewChildren',
];
function getScrubFileTransformer(program) {
    const checker = program.getTypeChecker();
    return (context) => {
        const transformer = (sf) => {
            const ngMetadata = findAngularMetadata(sf);
            const tslibImports = findTslibImports(sf);
            const nodes = [];
            ts.forEachChild(sf, checkNodeForDecorators);
            function checkNodeForDecorators(node) {
                if (node.kind !== ts.SyntaxKind.ExpressionStatement) {
                    // TS 2.4 nests decorators inside downleveled class IIFEs, so we
                    // must recurse into them to find the relevant expression statements.
                    return ts.forEachChild(node, checkNodeForDecorators);
                }
                const exprStmt = node;
                if (isDecoratorAssignmentExpression(exprStmt)) {
                    nodes.push(...pickDecorationNodesToRemove(exprStmt, ngMetadata, checker));
                }
                if (isDecorateAssignmentExpression(exprStmt, tslibImports, checker)) {
                    nodes.push(...pickDecorateNodesToRemove(exprStmt, tslibImports, ngMetadata, checker));
                }
                if (isAngularDecoratorMetadataExpression(exprStmt, ngMetadata, tslibImports, checker)) {
                    nodes.push(node);
                }
                if (isPropDecoratorAssignmentExpression(exprStmt)) {
                    nodes.push(...pickPropDecorationNodesToRemove(exprStmt, ngMetadata, checker));
                }
                if (isCtorParamsAssignmentExpression(exprStmt)
                    && !isCtorParamsWhitelistedService(exprStmt)) {
                    nodes.push(node);
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
exports.getScrubFileTransformer = getScrubFileTransformer;
function expect(node, kind) {
    if (node.kind !== kind) {
        throw new Error('Invalid node type.');
    }
    return node;
}
exports.expect = expect;
function nameOfSpecifier(node) {
    return node.name && node.name.text || '<unknown>';
}
function findAngularMetadata(node) {
    let specs = [];
    ts.forEachChild(node, (child) => {
        if (child.kind === ts.SyntaxKind.ImportDeclaration) {
            const importDecl = child;
            if (isAngularCoreImport(importDecl)) {
                specs.push(...ast_utils_1.collectDeepNodes(node, ts.SyntaxKind.ImportSpecifier)
                    .filter((spec) => isAngularCoreSpecifier(spec)));
            }
        }
    });
    const localDecl = findAllDeclarations(node)
        .filter((decl) => angularSpecifiers.indexOf(decl.name.text) !== -1);
    if (localDecl.length === angularSpecifiers.length) {
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
function isAngularCoreImport(node) {
    return true &&
        node.moduleSpecifier &&
        node.moduleSpecifier.kind === ts.SyntaxKind.StringLiteral &&
        node.moduleSpecifier.text === '@angular/core';
}
function isAngularCoreSpecifier(node) {
    return angularSpecifiers.indexOf(nameOfSpecifier(node)) !== -1;
}
// Check if assignment is `Clazz.decorators = [...];`.
function isDecoratorAssignmentExpression(exprStmt) {
    if (exprStmt.expression.kind !== ts.SyntaxKind.BinaryExpression) {
        return false;
    }
    const expr = exprStmt.expression;
    if (expr.left.kind !== ts.SyntaxKind.PropertyAccessExpression) {
        return false;
    }
    const propAccess = expr.left;
    if (propAccess.expression.kind !== ts.SyntaxKind.Identifier) {
        return false;
    }
    if (propAccess.name.text !== 'decorators') {
        return false;
    }
    if (expr.operatorToken.kind !== ts.SyntaxKind.FirstAssignment) {
        return false;
    }
    if (expr.right.kind !== ts.SyntaxKind.ArrayLiteralExpression) {
        return false;
    }
    return true;
}
// Check if assignment is `Clazz = __decorate([...], Clazz)`.
function isDecorateAssignmentExpression(exprStmt, tslibImports, checker) {
    if (exprStmt.expression.kind !== ts.SyntaxKind.BinaryExpression) {
        return false;
    }
    const expr = exprStmt.expression;
    if (expr.left.kind !== ts.SyntaxKind.Identifier) {
        return false;
    }
    const classIdent = expr.left;
    let callExpr;
    if (expr.right.kind === ts.SyntaxKind.CallExpression) {
        callExpr = expr.right;
    }
    else if (expr.right.kind === ts.SyntaxKind.BinaryExpression) {
        // `Clazz = Clazz_1 = __decorate([...], Clazz)` can be found when there are static property
        // accesses.
        const innerExpr = expr.right;
        if (innerExpr.left.kind !== ts.SyntaxKind.Identifier
            || innerExpr.right.kind !== ts.SyntaxKind.CallExpression) {
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
    if (callExpr.arguments[1].kind !== ts.SyntaxKind.Identifier) {
        return false;
    }
    const classArg = callExpr.arguments[1];
    if (classIdent.text !== classArg.text) {
        return false;
    }
    if (callExpr.arguments[0].kind !== ts.SyntaxKind.ArrayLiteralExpression) {
        return false;
    }
    return true;
}
// Check if expression is `__decorate([smt, __metadata("design:type", Object)], ...)`.
function isAngularDecoratorMetadataExpression(exprStmt, ngMetadata, tslibImports, checker) {
    if (exprStmt.expression.kind !== ts.SyntaxKind.CallExpression) {
        return false;
    }
    const callExpr = exprStmt.expression;
    if (!isTslibHelper(callExpr, '__decorate', tslibImports, checker)) {
        return false;
    }
    if (callExpr.arguments.length !== 4) {
        return false;
    }
    if (callExpr.arguments[0].kind !== ts.SyntaxKind.ArrayLiteralExpression) {
        return false;
    }
    const decorateArray = callExpr.arguments[0];
    // Check first array entry for Angular decorators.
    if (decorateArray.elements[0].kind !== ts.SyntaxKind.CallExpression) {
        return false;
    }
    const decoratorCall = decorateArray.elements[0];
    if (decoratorCall.expression.kind !== ts.SyntaxKind.Identifier) {
        return false;
    }
    const decoratorId = decoratorCall.expression;
    if (!identifierIsMetadata(decoratorId, ngMetadata, checker)) {
        return false;
    }
    // Check second array entry for __metadata call.
    if (decorateArray.elements[1].kind !== ts.SyntaxKind.CallExpression) {
        return false;
    }
    const metadataCall = decorateArray.elements[1];
    if (!isTslibHelper(metadataCall, '__metadata', tslibImports, checker)) {
        return false;
    }
    return true;
}
// Check if assignment is `Clazz.propDecorators = [...];`.
function isPropDecoratorAssignmentExpression(exprStmt) {
    if (exprStmt.expression.kind !== ts.SyntaxKind.BinaryExpression) {
        return false;
    }
    const expr = exprStmt.expression;
    if (expr.left.kind !== ts.SyntaxKind.PropertyAccessExpression) {
        return false;
    }
    const propAccess = expr.left;
    if (propAccess.expression.kind !== ts.SyntaxKind.Identifier) {
        return false;
    }
    if (propAccess.name.text !== 'propDecorators') {
        return false;
    }
    if (expr.operatorToken.kind !== ts.SyntaxKind.FirstAssignment) {
        return false;
    }
    if (expr.right.kind !== ts.SyntaxKind.ObjectLiteralExpression) {
        return false;
    }
    return true;
}
// Check if assignment is `Clazz.ctorParameters = [...];`.
function isCtorParamsAssignmentExpression(exprStmt) {
    if (exprStmt.expression.kind !== ts.SyntaxKind.BinaryExpression) {
        return false;
    }
    const expr = exprStmt.expression;
    if (expr.left.kind !== ts.SyntaxKind.PropertyAccessExpression) {
        return false;
    }
    const propAccess = expr.left;
    if (propAccess.name.text !== 'ctorParameters') {
        return false;
    }
    if (propAccess.expression.kind !== ts.SyntaxKind.Identifier) {
        return false;
    }
    if (expr.operatorToken.kind !== ts.SyntaxKind.FirstAssignment) {
        return false;
    }
    if (expr.right.kind !== ts.SyntaxKind.FunctionExpression
        && expr.right.kind !== ts.SyntaxKind.ArrowFunction) {
        return false;
    }
    return true;
}
function isCtorParamsWhitelistedService(exprStmt) {
    const expr = exprStmt.expression;
    const propAccess = expr.left;
    const serviceId = propAccess.expression;
    return platformWhitelist.indexOf(serviceId.text) !== -1;
}
// Remove Angular decorators from`Clazz.decorators = [...];`, or expression itself if all are
// removed.
function pickDecorationNodesToRemove(exprStmt, ngMetadata, checker) {
    const expr = expect(exprStmt.expression, ts.SyntaxKind.BinaryExpression);
    const literal = expect(expr.right, ts.SyntaxKind.ArrayLiteralExpression);
    if (!literal.elements.every((elem) => elem.kind === ts.SyntaxKind.ObjectLiteralExpression)) {
        return [];
    }
    const elements = literal.elements;
    const ngDecorators = elements.filter((elem) => isAngularDecorator(elem, ngMetadata, checker));
    return (elements.length > ngDecorators.length) ? ngDecorators : [exprStmt];
}
// Remove Angular decorators from `Clazz = __decorate([...], Clazz)`, or expression itself if all
// are removed.
function pickDecorateNodesToRemove(exprStmt, tslibImports, ngMetadata, checker) {
    const expr = expect(exprStmt.expression, ts.SyntaxKind.BinaryExpression);
    const classId = expect(expr.left, ts.SyntaxKind.Identifier);
    let callExpr;
    if (expr.right.kind === ts.SyntaxKind.CallExpression) {
        callExpr = expect(expr.right, ts.SyntaxKind.CallExpression);
    }
    else if (expr.right.kind === ts.SyntaxKind.BinaryExpression) {
        const innerExpr = expr.right;
        callExpr = expect(innerExpr.right, ts.SyntaxKind.CallExpression);
    }
    else {
        return [];
    }
    const arrLiteral = expect(callExpr.arguments[0], ts.SyntaxKind.ArrayLiteralExpression);
    if (!arrLiteral.elements.every((elem) => elem.kind === ts.SyntaxKind.CallExpression)) {
        return [];
    }
    const elements = arrLiteral.elements;
    const ngDecoratorCalls = elements.filter((el) => {
        if (el.expression.kind !== ts.SyntaxKind.Identifier) {
            return false;
        }
        const id = el.expression;
        return identifierIsMetadata(id, ngMetadata, checker);
    });
    // Only remove constructor parameter metadata on non-whitelisted classes.
    if (platformWhitelist.indexOf(classId.text) === -1) {
        // Remove __metadata calls of type 'design:paramtypes'.
        const metadataCalls = elements.filter((el) => {
            if (!isTslibHelper(el, '__metadata', tslibImports, checker)) {
                return false;
            }
            if (el.arguments.length < 2) {
                return false;
            }
            if (el.arguments[0].kind !== ts.SyntaxKind.StringLiteral) {
                return false;
            }
            const metadataTypeId = el.arguments[0];
            if (metadataTypeId.text !== 'design:paramtypes') {
                return false;
            }
            return true;
        });
        // Remove all __param calls.
        const paramCalls = elements.filter((el) => {
            if (!isTslibHelper(el, '__param', tslibImports, checker)) {
                return false;
            }
            if (el.arguments.length != 2) {
                return false;
            }
            if (el.arguments[0].kind !== ts.SyntaxKind.NumericLiteral) {
                return false;
            }
            return true;
        });
        ngDecoratorCalls.push(...metadataCalls, ...paramCalls);
    }
    // If all decorators are metadata decorators then return the whole `Class = __decorate([...])'`
    // statement so that it is removed in entirety
    return (elements.length === ngDecoratorCalls.length) ? [exprStmt] : ngDecoratorCalls;
}
// Remove Angular decorators from`Clazz.propDecorators = [...];`, or expression itself if all
// are removed.
function pickPropDecorationNodesToRemove(exprStmt, ngMetadata, checker) {
    const expr = expect(exprStmt.expression, ts.SyntaxKind.BinaryExpression);
    const literal = expect(expr.right, ts.SyntaxKind.ObjectLiteralExpression);
    if (!literal.properties.every((elem) => elem.kind === ts.SyntaxKind.PropertyAssignment &&
        elem.initializer.kind === ts.SyntaxKind.ArrayLiteralExpression)) {
        return [];
    }
    const assignments = literal.properties;
    // Consider each assignment individually. Either the whole assignment will be removed or
    // a particular decorator within will.
    const toRemove = assignments
        .map((assign) => {
        const decorators = expect(assign.initializer, ts.SyntaxKind.ArrayLiteralExpression).elements;
        if (!decorators.every((el) => el.kind === ts.SyntaxKind.ObjectLiteralExpression)) {
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
        toRemove.every((node) => node.kind === ts.SyntaxKind.PropertyAssignment)) {
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
    if (assign.initializer.kind !== ts.SyntaxKind.Identifier) {
        return false;
    }
    const id = assign.initializer;
    const res = identifierIsMetadata(id, ngMetadata, checker);
    return res;
}
function isTypeProperty(prop) {
    if (prop.kind !== ts.SyntaxKind.PropertyAssignment) {
        return false;
    }
    const assignment = prop;
    if (assignment.name.kind !== ts.SyntaxKind.Identifier) {
        return false;
    }
    const name = assignment.name;
    return name.text === 'type';
}
// Check if an identifier is part of the known Angular Metadata.
function identifierIsMetadata(id, metadata, checker) {
    const symbol = checker.getSymbolAtLocation(id);
    if (!symbol || !symbol.declarations || !symbol.declarations.length) {
        return false;
    }
    return symbol
        .declarations
        .some((spec) => metadata.indexOf(spec) !== -1);
}
// Check if an import is a tslib helper import (`import * as tslib from "tslib";`)
function isTslibImport(node) {
    return !!(node.moduleSpecifier &&
        node.moduleSpecifier.kind === ts.SyntaxKind.StringLiteral &&
        node.moduleSpecifier.text === 'tslib' &&
        node.importClause &&
        node.importClause.namedBindings &&
        node.importClause.namedBindings.kind === ts.SyntaxKind.NamespaceImport);
}
// Find all namespace imports for `tslib`.
function findTslibImports(node) {
    const imports = [];
    ts.forEachChild(node, (child) => {
        if (child.kind === ts.SyntaxKind.ImportDeclaration) {
            const importDecl = child;
            if (isTslibImport(importDecl)) {
                const importClause = importDecl.importClause;
                const namespaceImport = importClause.namedBindings;
                imports.push(namespaceImport);
            }
        }
    });
    return imports;
}
// Check if an identifier is part of the known tslib identifiers.
function identifierIsTslib(id, tslibImports, checker) {
    const symbol = checker.getSymbolAtLocation(id);
    if (!symbol || !symbol.declarations || !symbol.declarations.length) {
        return false;
    }
    return symbol
        .declarations
        .some((spec) => tslibImports.indexOf(spec) !== -1);
}
// Check if a function call is a tslib helper.
function isTslibHelper(callExpr, helper, tslibImports, checker) {
    let callExprIdent = callExpr.expression;
    if (callExpr.expression.kind !== ts.SyntaxKind.Identifier) {
        if (callExpr.expression.kind === ts.SyntaxKind.PropertyAccessExpression) {
            const propAccess = callExpr.expression;
            const left = propAccess.expression;
            callExprIdent = propAccess.name;
            if (left.kind !== ts.SyntaxKind.Identifier) {
                return false;
            }
            const id = left;
            if (!identifierIsTslib(id, tslibImports, checker)) {
                return false;
            }
        }
        else {
            return false;
        }
    }
    // node.text on a name that starts with two underscores will return three instead.
    // Unless it's an expression like tslib.__decorate, in which case it's only 2.
    if (callExprIdent.text !== `_${helper}` && callExprIdent.text !== helper) {
        return false;
    }
    return true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NydWItZmlsZS5qcyIsInNvdXJjZVJvb3QiOiIuLyIsInNvdXJjZXMiOlsicGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYnVpbGRfb3B0aW1pemVyL3NyYy90cmFuc2Zvcm1zL3NjcnViLWZpbGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7Ozs7O0dBTUc7QUFDSCxpQ0FBaUM7QUFDakMsb0RBQXdEO0FBR3hELFNBQWdCLGFBQWEsQ0FBQyxPQUFlO0lBQzNDLE1BQU0sT0FBTyxHQUFHO1FBQ2QsWUFBWTtRQUNaLFlBQVk7UUFDWixnQkFBZ0I7UUFDaEIsZ0JBQWdCO0tBQ2pCLENBQUM7SUFFRixPQUFPLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNsRSxDQUFDO0FBVEQsc0NBU0M7QUFFRCw0Q0FBNEM7QUFDNUMsTUFBTSxpQkFBaUIsR0FBRztJQUN4QixjQUFjO0lBQ2QscUJBQXFCO0lBQ3JCLFNBQVM7SUFDVCx5QkFBeUI7Q0FDMUIsQ0FBQztBQUVGLE1BQU0saUJBQWlCLEdBQUc7SUFDeEIsMEJBQTBCO0lBQzFCLFdBQVc7SUFDWCxXQUFXO0lBQ1gsWUFBWTtJQUNaLFVBQVU7SUFDVixNQUFNO0lBRU4sNkJBQTZCO0lBQzdCLGNBQWM7SUFDZCxpQkFBaUI7SUFDakIsYUFBYTtJQUNiLGNBQWM7SUFDZCxPQUFPO0lBQ1AsUUFBUTtJQUNSLFdBQVc7SUFDWCxjQUFjO0NBQ2YsQ0FBQztBQUVGLFNBQWdCLHVCQUF1QixDQUFDLE9BQW1CO0lBQ3pELE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxjQUFjLEVBQUUsQ0FBQztJQUV6QyxPQUFPLENBQUMsT0FBaUMsRUFBaUMsRUFBRTtRQUUxRSxNQUFNLFdBQVcsR0FBa0MsQ0FBQyxFQUFpQixFQUFFLEVBQUU7WUFFdkUsTUFBTSxVQUFVLEdBQUcsbUJBQW1C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S0FBSyxDQUFDO0tBQ2Q7SUFFRCxPQUFPLElBQUksQ0FBQztBQUNkLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5pbXBvcnQgKiBhcyB0cyBmcm9tICd0eXBlc2NyaXB0JztcbmltcG9ydCB7IGNvbGxlY3REZWVwTm9kZXMgfSBmcm9tICcuLi9oZWxwZXJzL2FzdC11dGlscyc7XG5cblxuZXhwb3J0IGZ1bmN0aW9uIHRlc3RTY3J1YkZpbGUoY29udGVudDogc3RyaW5nKSB7XG4gIGNvbnN0IG1hcmtlcnMgPSBbXG4gICAgJ2RlY29yYXRvcnMnLFxuICAgICdfX2RlY29yYXRlJyxcbiAgICAncHJvcERlY29yYXRvcnMnLFxuICAgICdjdG9yUGFyYW1ldGVycycsXG4gIF07XG5cbiAgcmV0dXJuIG1hcmtlcnMuc29tZSgobWFya2VyKSA9PiBjb250ZW50LmluZGV4T2YobWFya2VyKSAhPT0gLTEpO1xufVxuXG4vLyBEb24ndCByZW1vdmUgYGN0b3JQYXJhbWV0ZXJzYCBmcm9tIHRoZXNlLlxuY29uc3QgcGxhdGZvcm1XaGl0ZWxpc3QgPSBbXG4gICdQbGF0Zm9ybVJlZl8nLFxuICAnVGVzdGFiaWxpdHlSZWdpc3RyeScsXG4gICdDb25zb2xlJyxcbiAgJ0Jyb3dzZXJQbGF0Zm9ybUxvY2F0aW9uJyxcbl07XG5cbmNvbnN0IGFuZ3VsYXJTcGVjaWZpZXJzID0gW1xuICAvLyBDbGFzcyBsZXZlbCBkZWNvcmF0b3JzLlxuICAnQ29tcG9uZW50JyxcbiAgJ0RpcmVjdGl2ZScsXG4gICdJbmplY3RhYmxlJyxcbiAgJ05nTW9kdWxlJyxcbiAgJ1BpcGUnLFxuXG4gIC8vIFByb3BlcnR5IGxldmVsIGRlY29yYXRvcnMuXG4gICdDb250ZW50Q2hpbGQnLFxuICAnQ29udGVudENoaWxkcmVuJyxcbiAgJ0hvc3RCaW5kaW5nJyxcbiAgJ0hvc3RMaXN0ZW5lcicsXG4gICdJbnB1dCcsXG4gICdPdXRwdXQnLFxuICAnVmlld0NoaWxkJyxcbiAgJ1ZpZXdDaGlsZHJlbicsXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2NydWJGaWxlVHJhbnNmb3JtZXIocHJvZ3JhbTogdHMuUHJvZ3JhbSk6IHRzLlRyYW5zZm9ybWVyRmFjdG9yeTx0cy5Tb3VyY2VGaWxlPiB7XG4gIGNvbnN0IGNoZWNrZXIgPSBwcm9ncmFtLmdldFR5cGVDaGVja2VyKCk7XG5cbiAgcmV0dXJuIChjb250ZXh0OiB0cy5UcmFuc2Zvcm1hdGlvbkNvbnRleHQpOiB0cy5UcmFuc2Zvcm1lcjx0cy5Tb3VyY2VGaWxlPiA9PiB7XG5cbiAgICBjb25zdCB0cmFuc2Zvcm1lcjogdHMuVHJhbnNmb3JtZXI8dHMuU291cmNlRmlsZT4gPSAoc2Y6IHRzLlNvdXJjZUZpbGUpID0+IHtcblxuICAgICAgY29uc3QgbmdNZXRhZGF0YSA9IGZpbmRBbmd1bGFyTWV0YWRhdGEoc2YpO1xuICAgICAgY29uc3QgdHNsaWJJbXBvcnRzID0gZmluZFRzbGliSW1wb3J0cyhzZik7XG5cbiAgICAgIGNvbnN0IG5vZGVzOiB0cy5Ob2RlW10gPSBbXTtcbiAgICAgIHRzLmZvckVhY2hDaGlsZChzZiwgY2hlY2tOb2RlRm9yRGVjb3JhdG9ycyk7XG5cbiAgICAgIGZ1bmN0aW9uIGNoZWNrTm9kZUZvckRlY29yYXRvcnMobm9kZTogdHMuTm9kZSk6IHZvaWQge1xuICAgICAgICBpZiAobm9kZS5raW5kICE9PSB0cy5TeW50YXhLaW5kLkV4cHJlc3Npb25TdGF0ZW1lbnQpIHtcbiAgICAgICAgICAvLyBUUyAyLjQgbmVzdHMgZGVjb3JhdG9ycyBpbnNpZGUgZG93bmxldmVsZWQgY2xhc3MgSUlGRXMsIHNvIHdlXG4gICAgICAgICAgLy8gbXVzdCByZWN1cnNlIGludG8gdGhlbSB0byBmaW5kIHRoZSByZWxldmFudCBleHByZXNzaW9uIHN0YXRlbWVudHMuXG4gICAgICAgICAgcmV0dXJuIHRzLmZvckVhY2hDaGlsZChub2RlLCBjaGVja05vZGVGb3JEZWNvcmF0b3JzKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBleHByU3RtdCA9IG5vZGUgYXMgdHMuRXhwcmVzc2lvblN0YXRlbWVudDtcbiAgICAgICAgaWYgKGlzRGVjb3JhdG9yQXNzaWdubWVudEV4cHJlc3Npb24oZXhwclN0bXQpKSB7XG4gICAgICAgICAgbm9kZXMucHVzaCguLi5waWNrRGVjb3JhdGlvbk5vZGVzVG9SZW1vdmUoZXhwclN0bXQsIG5nTWV0YWRhdGEsIGNoZWNrZXIpKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaXNEZWNvcmF0ZUFzc2lnbm1lbnRFeHByZXNzaW9uKGV4cHJTdG10LCB0c2xpYkltcG9ydHMsIGNoZWNrZXIpKSB7XG4gICAgICAgICAgbm9kZXMucHVzaCguLi5waWNrRGVjb3JhdGVOb2Rlc1RvUmVtb3ZlKGV4cHJTdG10LCB0c2xpYkltcG9ydHMsIG5nTWV0YWRhdGEsIGNoZWNrZXIpKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaXNBbmd1bGFyRGVjb3JhdG9yTWV0YWRhdGFFeHByZXNzaW9uKGV4cHJTdG10LCBuZ01ldGFkYXRhLCB0c2xpYkltcG9ydHMsIGNoZWNrZXIpKSB7XG4gICAgICAgICAgbm9kZXMucHVzaChub2RlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoaXNQcm9wRGVjb3JhdG9yQXNzaWdubWVudEV4cHJlc3Npb24oZXhwclN0bXQpKSB7XG4gICAgICAgICAgbm9kZXMucHVzaCguLi5waWNrUHJvcERlY29yYXRpb25Ob2Rlc1RvUmVtb3ZlKGV4cHJTdG10LCBuZ01ldGFkYXRhLCBjaGVja2VyKSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlzQ3RvclBhcmFtc0Fzc2lnbm1lbnRFeHByZXNzaW9uKGV4cHJTdG10KVxuICAgICAgICAgICYmICFpc0N0b3JQYXJhbXNXaGl0ZWxpc3RlZFNlcnZpY2UoZXhwclN0bXQpKSB7XG4gICAgICAgICAgbm9kZXMucHVzaChub2RlKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCB2aXNpdG9yOiB0cy5WaXNpdG9yID0gKG5vZGU6IHRzLk5vZGUpOiB0cy5WaXNpdFJlc3VsdDx0cy5Ob2RlPiA9PiB7XG4gICAgICAgIC8vIENoZWNrIGlmIG5vZGUgaXMgYSBzdGF0ZW1lbnQgdG8gYmUgZHJvcHBlZC5cbiAgICAgICAgaWYgKG5vZGVzLmZpbmQoKG4pID0+IG4gPT09IG5vZGUpKSB7XG4gICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE90aGVyd2lzZSByZXR1cm4gbm9kZSBhcyBpcy5cbiAgICAgICAgcmV0dXJuIHRzLnZpc2l0RWFjaENoaWxkKG5vZGUsIHZpc2l0b3IsIGNvbnRleHQpO1xuICAgICAgfTtcblxuICAgICAgcmV0dXJuIHRzLnZpc2l0Tm9kZShzZiwgdmlzaXRvcik7XG4gICAgfTtcblxuICAgIHJldHVybiB0cmFuc2Zvcm1lcjtcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cGVjdDxUIGV4dGVuZHMgdHMuTm9kZT4obm9kZTogdHMuTm9kZSwga2luZDogdHMuU3ludGF4S2luZCk6IFQge1xuICBpZiAobm9kZS5raW5kICE9PSBraW5kKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIG5vZGUgdHlwZS4nKTtcbiAgfVxuXG4gIHJldHVybiBub2RlIGFzIFQ7XG59XG5cbmZ1bmN0aW9uIG5hbWVPZlNwZWNpZmllcihub2RlOiB0cy5JbXBvcnRTcGVjaWZpZXIpOiBzdHJpbmcge1xuICByZXR1cm4gbm9kZS5uYW1lICYmIG5vZGUubmFtZS50ZXh0IHx8ICc8dW5rbm93bj4nO1xufVxuXG5mdW5jdGlvbiBmaW5kQW5ndWxhck1ldGFkYXRhKG5vZGU6IHRzLk5vZGUpOiB0cy5Ob2RlW10ge1xuICBsZXQgc3BlY3M6IHRzLk5vZGVbXSA9IFtdO1xuICB0cy5mb3JFYWNoQ2hpbGQobm9kZSwgKGNoaWxkKSA9PiB7XG4gICAgaWYgKGNoaWxkLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuSW1wb3J0RGVjbGFyYXRpb24pIHtcbiAgICAgIGNvbnN0IGltcG9ydERlY2wgPSBjaGlsZCBhcyB0cy5JbXBvcnREZWNsYXJhdGlvbjtcbiAgICAgIGlmIChpc0FuZ3VsYXJDb3JlSW1wb3J0KGltcG9ydERlY2wpKSB7XG4gICAgICAgIHNwZWNzLnB1c2goLi4uY29sbGVjdERlZXBOb2Rlczx0cy5JbXBvcnRTcGVjaWZpZXI+KG5vZGUsIHRzLlN5bnRheEtpbmQuSW1wb3J0U3BlY2lmaWVyKVxuICAgICAgICAgIC5maWx0ZXIoKHNwZWMpID0+IGlzQW5ndWxhckNvcmVTcGVjaWZpZXIoc3BlYykpKTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuXG4gIGNvbnN0IGxvY2FsRGVjbCA9IGZpbmRBbGxEZWNsYXJhdGlvbnMobm9kZSlcbiAgICAuZmlsdGVyKChkZWNsKSA9PiBhbmd1bGFyU3BlY2lmaWVycy5pbmRleE9mKChkZWNsLm5hbWUgYXMgdHMuSWRlbnRpZmllcikudGV4dCkgIT09IC0xKTtcbiAgaWYgKGxvY2FsRGVjbC5sZW5ndGggPT09IGFuZ3VsYXJTcGVjaWZpZXJzLmxlbmd0aCkge1xuICAgIHNwZWNzID0gc3BlY3MuY29uY2F0KGxvY2FsRGVjbCk7XG4gIH1cblxuICByZXR1cm4gc3BlY3M7XG59XG5cbmZ1bmN0aW9uIGZpbmRBbGxEZWNsYXJhdGlvbnMobm9kZTogdHMuTm9kZSk6IHRzLlZhcmlhYmxlRGVjbGFyYXRpb25bXSB7XG4gIGNvbnN0IG5vZGVzOiB0cy5WYXJpYWJsZURlY2xhcmF0aW9uW10gPSBbXTtcbiAgdHMuZm9yRWFjaENoaWxkKG5vZGUsIChjaGlsZCkgPT4ge1xuICAgIGlmIChjaGlsZC5raW5kID09PSB0cy5TeW50YXhLaW5kLlZhcmlhYmxlU3RhdGVtZW50KSB7XG4gICAgICBjb25zdCB2U3RtdCA9IGNoaWxkIGFzIHRzLlZhcmlhYmxlU3RhdGVtZW50O1xuICAgICAgdlN0bXQuZGVjbGFyYXRpb25MaXN0LmRlY2xhcmF0aW9ucy5mb3JFYWNoKChkZWNsKSA9PiB7XG4gICAgICAgIGlmIChkZWNsLm5hbWUua2luZCAhPT0gdHMuU3ludGF4S2luZC5JZGVudGlmaWVyKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIG5vZGVzLnB1c2goZGVjbCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiBub2Rlcztcbn1cblxuZnVuY3Rpb24gaXNBbmd1bGFyQ29yZUltcG9ydChub2RlOiB0cy5JbXBvcnREZWNsYXJhdGlvbik6IGJvb2xlYW4ge1xuICByZXR1cm4gdHJ1ZSAmJlxuICAgIG5vZGUubW9kdWxlU3BlY2lmaWVyICYmXG4gICAgbm9kZS5tb2R1bGVTcGVjaWZpZXIua2luZCA9PT0gdHMuU3ludGF4S2luZC5TdHJpbmdMaXRlcmFsICYmXG4gICAgKG5vZGUubW9kdWxlU3BlY2lmaWVyIGFzIHRzLlN0cmluZ0xpdGVyYWwpLnRleHQgPT09ICdAYW5ndWxhci9jb3JlJztcbn1cblxuZnVuY3Rpb24gaXNBbmd1bGFyQ29yZVNwZWNpZmllcihub2RlOiB0cy5JbXBvcnRTcGVjaWZpZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIGFuZ3VsYXJTcGVjaWZpZXJzLmluZGV4T2YobmFtZU9mU3BlY2lmaWVyKG5vZGUpKSAhPT0gLTE7XG59XG5cbi8vIENoZWNrIGlmIGFzc2lnbm1lbnQgaXMgYENsYXp6LmRlY29yYXRvcnMgPSBbLi4uXTtgLlxuZnVuY3Rpb24gaXNEZWNvcmF0b3JBc3NpZ25tZW50RXhwcmVzc2lvbihleHByU3RtdDogdHMuRXhwcmVzc2lvblN0YXRlbWVudCk6IGJvb2xlYW4ge1xuICBpZiAoZXhwclN0bXQuZXhwcmVzc2lvbi5raW5kICE9PSB0cy5TeW50YXhLaW5kLkJpbmFyeUV4cHJlc3Npb24pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY29uc3QgZXhwciA9IGV4cHJTdG10LmV4cHJlc3Npb24gYXMgdHMuQmluYXJ5RXhwcmVzc2lvbjtcbiAgaWYgKGV4cHIubGVmdC5raW5kICE9PSB0cy5TeW50YXhLaW5kLlByb3BlcnR5QWNjZXNzRXhwcmVzc2lvbikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjb25zdCBwcm9wQWNjZXNzID0gZXhwci5sZWZ0IGFzIHRzLlByb3BlcnR5QWNjZXNzRXhwcmVzc2lvbjtcbiAgaWYgKHByb3BBY2Nlc3MuZXhwcmVzc2lvbi5raW5kICE9PSB0cy5TeW50YXhLaW5kLklkZW50aWZpZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKHByb3BBY2Nlc3MubmFtZS50ZXh0ICE9PSAnZGVjb3JhdG9ycycpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGV4cHIub3BlcmF0b3JUb2tlbi5raW5kICE9PSB0cy5TeW50YXhLaW5kLkZpcnN0QXNzaWdubWVudCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoZXhwci5yaWdodC5raW5kICE9PSB0cy5TeW50YXhLaW5kLkFycmF5TGl0ZXJhbEV4cHJlc3Npb24pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gQ2hlY2sgaWYgYXNzaWdubWVudCBpcyBgQ2xhenogPSBfX2RlY29yYXRlKFsuLi5dLCBDbGF6eilgLlxuZnVuY3Rpb24gaXNEZWNvcmF0ZUFzc2lnbm1lbnRFeHByZXNzaW9uKFxuICBleHByU3RtdDogdHMuRXhwcmVzc2lvblN0YXRlbWVudCxcbiAgdHNsaWJJbXBvcnRzOiB0cy5OYW1lc3BhY2VJbXBvcnRbXSxcbiAgY2hlY2tlcjogdHMuVHlwZUNoZWNrZXIsXG4pOiBib29sZWFuIHtcblxuICBpZiAoZXhwclN0bXQuZXhwcmVzc2lvbi5raW5kICE9PSB0cy5TeW50YXhLaW5kLkJpbmFyeUV4cHJlc3Npb24pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY29uc3QgZXhwciA9IGV4cHJTdG10LmV4cHJlc3Npb24gYXMgdHMuQmluYXJ5RXhwcmVzc2lvbjtcbiAgaWYgKGV4cHIubGVmdC5raW5kICE9PSB0cy5TeW50YXhLaW5kLklkZW50aWZpZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY29uc3QgY2xhc3NJZGVudCA9IGV4cHIubGVmdCBhcyB0cy5JZGVudGlmaWVyO1xuICBsZXQgY2FsbEV4cHI6IHRzLkNhbGxFeHByZXNzaW9uO1xuXG4gIGlmIChleHByLnJpZ2h0LmtpbmQgPT09IHRzLlN5bnRheEtpbmQuQ2FsbEV4cHJlc3Npb24pIHtcbiAgICBjYWxsRXhwciA9IGV4cHIucmlnaHQgYXMgdHMuQ2FsbEV4cHJlc3Npb247XG4gIH0gZWxzZSBpZiAoZXhwci5yaWdodC5raW5kID09PSB0cy5TeW50YXhLaW5kLkJpbmFyeUV4cHJlc3Npb24pIHtcbiAgICAvLyBgQ2xhenogPSBDbGF6el8xID0gX19kZWNvcmF0ZShbLi4uXSwgQ2xhenopYCBjYW4gYmUgZm91bmQgd2hlbiB0aGVyZSBhcmUgc3RhdGljIHByb3BlcnR5XG4gICAgLy8gYWNjZXNzZXMuXG4gICAgY29uc3QgaW5uZXJFeHByID0gZXhwci5yaWdodCBhcyB0cy5CaW5hcnlFeHByZXNzaW9uO1xuICAgIGlmIChpbm5lckV4cHIubGVmdC5raW5kICE9PSB0cy5TeW50YXhLaW5kLklkZW50aWZpZXJcbiAgICAgIHx8IGlubmVyRXhwci5yaWdodC5raW5kICE9PSB0cy5TeW50YXhLaW5kLkNhbGxFeHByZXNzaW9uKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNhbGxFeHByID0gaW5uZXJFeHByLnJpZ2h0IGFzIHRzLkNhbGxFeHByZXNzaW9uO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmICghaXNUc2xpYkhlbHBlcihjYWxsRXhwciwgJ19fZGVjb3JhdGUnLCB0c2xpYkltcG9ydHMsIGNoZWNrZXIpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKGNhbGxFeHByLmFyZ3VtZW50cy5sZW5ndGggIT09IDIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGNhbGxFeHByLmFyZ3VtZW50c1sxXS5raW5kICE9PSB0cy5TeW50YXhLaW5kLklkZW50aWZpZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY29uc3QgY2xhc3NBcmcgPSBjYWxsRXhwci5hcmd1bWVudHNbMV0gYXMgdHMuSWRlbnRpZmllcjtcbiAgaWYgKGNsYXNzSWRlbnQudGV4dCAhPT0gY2xhc3NBcmcudGV4dCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoY2FsbEV4cHIuYXJndW1lbnRzWzBdLmtpbmQgIT09IHRzLlN5bnRheEtpbmQuQXJyYXlMaXRlcmFsRXhwcmVzc2lvbikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyBDaGVjayBpZiBleHByZXNzaW9uIGlzIGBfX2RlY29yYXRlKFtzbXQsIF9fbWV0YWRhdGEoXCJkZXNpZ246dHlwZVwiLCBPYmplY3QpXSwgLi4uKWAuXG5mdW5jdGlvbiBpc0FuZ3VsYXJEZWNvcmF0b3JNZXRhZGF0YUV4cHJlc3Npb24oXG4gIGV4cHJTdG10OiB0cy5FeHByZXNzaW9uU3RhdGVtZW50LFxuICBuZ01ldGFkYXRhOiB0cy5Ob2RlW10sXG4gIHRzbGliSW1wb3J0czogdHMuTmFtZXNwYWNlSW1wb3J0W10sXG4gIGNoZWNrZXI6IHRzLlR5cGVDaGVja2VyLFxuKTogYm9vbGVhbiB7XG5cbiAgaWYgKGV4cHJTdG10LmV4cHJlc3Npb24ua2luZCAhPT0gdHMuU3ludGF4S2luZC5DYWxsRXhwcmVzc2lvbikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjb25zdCBjYWxsRXhwciA9IGV4cHJTdG10LmV4cHJlc3Npb24gYXMgdHMuQ2FsbEV4cHJlc3Npb247XG4gIGlmICghaXNUc2xpYkhlbHBlcihjYWxsRXhwciwgJ19fZGVjb3JhdGUnLCB0c2xpYkltcG9ydHMsIGNoZWNrZXIpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChjYWxsRXhwci5hcmd1bWVudHMubGVuZ3RoICE9PSA0KSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChjYWxsRXhwci5hcmd1bWVudHNbMF0ua2luZCAhPT0gdHMuU3ludGF4S2luZC5BcnJheUxpdGVyYWxFeHByZXNzaW9uKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IGRlY29yYXRlQXJyYXkgPSBjYWxsRXhwci5hcmd1bWVudHNbMF0gYXMgdHMuQXJyYXlMaXRlcmFsRXhwcmVzc2lvbjtcbiAgLy8gQ2hlY2sgZmlyc3QgYXJyYXkgZW50cnkgZm9yIEFuZ3VsYXIgZGVjb3JhdG9ycy5cbiAgaWYgKGRlY29yYXRlQXJyYXkuZWxlbWVudHNbMF0ua2luZCAhPT0gdHMuU3ludGF4S2luZC5DYWxsRXhwcmVzc2lvbikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjb25zdCBkZWNvcmF0b3JDYWxsID0gZGVjb3JhdGVBcnJheS5lbGVtZW50c1swXSBhcyB0cy5DYWxsRXhwcmVzc2lvbjtcbiAgaWYgKGRlY29yYXRvckNhbGwuZXhwcmVzc2lvbi5raW5kICE9PSB0cy5TeW50YXhLaW5kLklkZW50aWZpZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY29uc3QgZGVjb3JhdG9ySWQgPSBkZWNvcmF0b3JDYWxsLmV4cHJlc3Npb24gYXMgdHMuSWRlbnRpZmllcjtcbiAgaWYgKCFpZGVudGlmaWVySXNNZXRhZGF0YShkZWNvcmF0b3JJZCwgbmdNZXRhZGF0YSwgY2hlY2tlcikpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgLy8gQ2hlY2sgc2Vjb25kIGFycmF5IGVudHJ5IGZvciBfX21ldGFkYXRhIGNhbGwuXG4gIGlmIChkZWNvcmF0ZUFycmF5LmVsZW1lbnRzWzFdLmtpbmQgIT09IHRzLlN5bnRheEtpbmQuQ2FsbEV4cHJlc3Npb24pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgY29uc3QgbWV0YWRhdGFDYWxsID0gZGVjb3JhdGVBcnJheS5lbGVtZW50c1sxXSBhcyB0cy5DYWxsRXhwcmVzc2lvbjtcbiAgaWYgKCFpc1RzbGliSGVscGVyKG1ldGFkYXRhQ2FsbCwgJ19fbWV0YWRhdGEnLCB0c2xpYkltcG9ydHMsIGNoZWNrZXIpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIENoZWNrIGlmIGFzc2lnbm1lbnQgaXMgYENsYXp6LnByb3BEZWNvcmF0b3JzID0gWy4uLl07YC5cbmZ1bmN0aW9uIGlzUHJvcERlY29yYXRvckFzc2lnbm1lbnRFeHByZXNzaW9uKGV4cHJTdG10OiB0cy5FeHByZXNzaW9uU3RhdGVtZW50KTogYm9vbGVhbiB7XG4gIGlmIChleHByU3RtdC5leHByZXNzaW9uLmtpbmQgIT09IHRzLlN5bnRheEtpbmQuQmluYXJ5RXhwcmVzc2lvbikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjb25zdCBleHByID0gZXhwclN0bXQuZXhwcmVzc2lvbiBhcyB0cy5CaW5hcnlFeHByZXNzaW9uO1xuICBpZiAoZXhwci5sZWZ0LmtpbmQgIT09IHRzLlN5bnRheEtpbmQuUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IHByb3BBY2Nlc3MgPSBleHByLmxlZnQgYXMgdHMuUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uO1xuICBpZiAocHJvcEFjY2Vzcy5leHByZXNzaW9uLmtpbmQgIT09IHRzLlN5bnRheEtpbmQuSWRlbnRpZmllcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAocHJvcEFjY2Vzcy5uYW1lLnRleHQgIT09ICdwcm9wRGVjb3JhdG9ycycpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGV4cHIub3BlcmF0b3JUb2tlbi5raW5kICE9PSB0cy5TeW50YXhLaW5kLkZpcnN0QXNzaWdubWVudCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoZXhwci5yaWdodC5raW5kICE9PSB0cy5TeW50YXhLaW5kLk9iamVjdExpdGVyYWxFeHByZXNzaW9uKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIENoZWNrIGlmIGFzc2lnbm1lbnQgaXMgYENsYXp6LmN0b3JQYXJhbWV0ZXJzID0gWy4uLl07YC5cbmZ1bmN0aW9uIGlzQ3RvclBhcmFtc0Fzc2lnbm1lbnRFeHByZXNzaW9uKGV4cHJTdG10OiB0cy5FeHByZXNzaW9uU3RhdGVtZW50KTogYm9vbGVhbiB7XG4gIGlmIChleHByU3RtdC5leHByZXNzaW9uLmtpbmQgIT09IHRzLlN5bnRheEtpbmQuQmluYXJ5RXhwcmVzc2lvbikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjb25zdCBleHByID0gZXhwclN0bXQuZXhwcmVzc2lvbiBhcyB0cy5CaW5hcnlFeHByZXNzaW9uO1xuICBpZiAoZXhwci5sZWZ0LmtpbmQgIT09IHRzLlN5bnRheEtpbmQuUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IHByb3BBY2Nlc3MgPSBleHByLmxlZnQgYXMgdHMuUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uO1xuICBpZiAocHJvcEFjY2Vzcy5uYW1lLnRleHQgIT09ICdjdG9yUGFyYW1ldGVycycpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKHByb3BBY2Nlc3MuZXhwcmVzc2lvbi5raW5kICE9PSB0cy5TeW50YXhLaW5kLklkZW50aWZpZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGV4cHIub3BlcmF0b3JUb2tlbi5raW5kICE9PSB0cy5TeW50YXhLaW5kLkZpcnN0QXNzaWdubWVudCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoZXhwci5yaWdodC5raW5kICE9PSB0cy5TeW50YXhLaW5kLkZ1bmN0aW9uRXhwcmVzc2lvblxuICAgICYmIGV4cHIucmlnaHQua2luZCAhPT0gdHMuU3ludGF4S2luZC5BcnJvd0Z1bmN0aW9uXG4gICkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpc0N0b3JQYXJhbXNXaGl0ZWxpc3RlZFNlcnZpY2UoZXhwclN0bXQ6IHRzLkV4cHJlc3Npb25TdGF0ZW1lbnQpOiBib29sZWFuIHtcbiAgY29uc3QgZXhwciA9IGV4cHJTdG10LmV4cHJlc3Npb24gYXMgdHMuQmluYXJ5RXhwcmVzc2lvbjtcbiAgY29uc3QgcHJvcEFjY2VzcyA9IGV4cHIubGVmdCBhcyB0cy5Qcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb247XG4gIGNvbnN0IHNlcnZpY2VJZCA9IHByb3BBY2Nlc3MuZXhwcmVzc2lvbiBhcyB0cy5JZGVudGlmaWVyO1xuXG4gIHJldHVybiBwbGF0Zm9ybVdoaXRlbGlzdC5pbmRleE9mKHNlcnZpY2VJZC50ZXh0KSAhPT0gLTE7XG59XG5cbi8vIFJlbW92ZSBBbmd1bGFyIGRlY29yYXRvcnMgZnJvbWBDbGF6ei5kZWNvcmF0b3JzID0gWy4uLl07YCwgb3IgZXhwcmVzc2lvbiBpdHNlbGYgaWYgYWxsIGFyZVxuLy8gcmVtb3ZlZC5cbmZ1bmN0aW9uIHBpY2tEZWNvcmF0aW9uTm9kZXNUb1JlbW92ZShcbiAgZXhwclN0bXQ6IHRzLkV4cHJlc3Npb25TdGF0ZW1lbnQsXG4gIG5nTWV0YWRhdGE6IHRzLk5vZGVbXSxcbiAgY2hlY2tlcjogdHMuVHlwZUNoZWNrZXIsXG4pOiB0cy5Ob2RlW10ge1xuXG4gIGNvbnN0IGV4cHIgPSBleHBlY3Q8dHMuQmluYXJ5RXhwcmVzc2lvbj4oZXhwclN0bXQuZXhwcmVzc2lvbiwgdHMuU3ludGF4S2luZC5CaW5hcnlFeHByZXNzaW9uKTtcbiAgY29uc3QgbGl0ZXJhbCA9IGV4cGVjdDx0cy5BcnJheUxpdGVyYWxFeHByZXNzaW9uPihleHByLnJpZ2h0LFxuICAgIHRzLlN5bnRheEtpbmQuQXJyYXlMaXRlcmFsRXhwcmVzc2lvbik7XG4gIGlmICghbGl0ZXJhbC5lbGVtZW50cy5ldmVyeSgoZWxlbSkgPT4gZWxlbS5raW5kID09PSB0cy5TeW50YXhLaW5kLk9iamVjdExpdGVyYWxFeHByZXNzaW9uKSkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuICBjb25zdCBlbGVtZW50cyA9IGxpdGVyYWwuZWxlbWVudHMgYXMgdHMuTm9kZUFycmF5PHRzLk9iamVjdExpdGVyYWxFeHByZXNzaW9uPjtcbiAgY29uc3QgbmdEZWNvcmF0b3JzID0gZWxlbWVudHMuZmlsdGVyKChlbGVtKSA9PiBpc0FuZ3VsYXJEZWNvcmF0b3IoZWxlbSwgbmdNZXRhZGF0YSwgY2hlY2tlcikpO1xuXG4gIHJldHVybiAoZWxlbWVudHMubGVuZ3RoID4gbmdEZWNvcmF0b3JzLmxlbmd0aCkgPyBuZ0RlY29yYXRvcnMgOiBbZXhwclN0bXRdO1xufVxuXG4vLyBSZW1vdmUgQW5ndWxhciBkZWNvcmF0b3JzIGZyb20gYENsYXp6ID0gX19kZWNvcmF0ZShbLi4uXSwgQ2xhenopYCwgb3IgZXhwcmVzc2lvbiBpdHNlbGYgaWYgYWxsXG4vLyBhcmUgcmVtb3ZlZC5cbmZ1bmN0aW9uIHBpY2tEZWNvcmF0ZU5vZGVzVG9SZW1vdmUoXG4gIGV4cHJTdG10OiB0cy5FeHByZXNzaW9uU3RhdGVtZW50LFxuICB0c2xpYkltcG9ydHM6IHRzLk5hbWVzcGFjZUltcG9ydFtdLFxuICBuZ01ldGFkYXRhOiB0cy5Ob2RlW10sXG4gIGNoZWNrZXI6IHRzLlR5cGVDaGVja2VyLFxuKTogdHMuTm9kZVtdIHtcblxuICBjb25zdCBleHByID0gZXhwZWN0PHRzLkJpbmFyeUV4cHJlc3Npb24+KGV4cHJTdG10LmV4cHJlc3Npb24sIHRzLlN5bnRheEtpbmQuQmluYXJ5RXhwcmVzc2lvbik7XG4gIGNvbnN0IGNsYXNzSWQgPSBleHBlY3Q8dHMuSWRlbnRpZmllcj4oZXhwci5sZWZ0LCB0cy5TeW50YXhLaW5kLklkZW50aWZpZXIpO1xuICBsZXQgY2FsbEV4cHI6IHRzLkNhbGxFeHByZXNzaW9uO1xuXG4gIGlmIChleHByLnJpZ2h0LmtpbmQgPT09IHRzLlN5bnRheEtpbmQuQ2FsbEV4cHJlc3Npb24pIHtcbiAgICBjYWxsRXhwciA9IGV4cGVjdDx0cy5DYWxsRXhwcmVzc2lvbj4oZXhwci5yaWdodCwgdHMuU3ludGF4S2luZC5DYWxsRXhwcmVzc2lvbik7XG4gIH0gZWxzZSBpZiAoZXhwci5yaWdodC5raW5kID09PSB0cy5TeW50YXhLaW5kLkJpbmFyeUV4cHJlc3Npb24pIHtcbiAgICBjb25zdCBpbm5lckV4cHIgPSBleHByLnJpZ2h0IGFzIHRzLkJpbmFyeUV4cHJlc3Npb247XG4gICAgY2FsbEV4cHIgPSBleHBlY3Q8dHMuQ2FsbEV4cHJlc3Npb24+KGlubmVyRXhwci5yaWdodCwgdHMuU3ludGF4S2luZC5DYWxsRXhwcmVzc2lvbik7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgY29uc3QgYXJyTGl0ZXJhbCA9IGV4cGVjdDx0cy5BcnJheUxpdGVyYWxFeHByZXNzaW9uPihjYWxsRXhwci5hcmd1bWVudHNbMF0sXG4gICAgdHMuU3ludGF4S2luZC5BcnJheUxpdGVyYWxFeHByZXNzaW9uKTtcblxuICBpZiAoIWFyckxpdGVyYWwuZWxlbWVudHMuZXZlcnkoKGVsZW0pID0+IGVsZW0ua2luZCA9PT0gdHMuU3ludGF4S2luZC5DYWxsRXhwcmVzc2lvbikpIHtcbiAgICByZXR1cm4gW107XG4gIH1cbiAgY29uc3QgZWxlbWVudHMgPSBhcnJMaXRlcmFsLmVsZW1lbnRzIGFzIHRzLk5vZGVBcnJheTx0cy5DYWxsRXhwcmVzc2lvbj47XG4gIGNvbnN0IG5nRGVjb3JhdG9yQ2FsbHMgPSBlbGVtZW50cy5maWx0ZXIoKGVsKSA9PiB7XG4gICAgaWYgKGVsLmV4cHJlc3Npb24ua2luZCAhPT0gdHMuU3ludGF4S2luZC5JZGVudGlmaWVyKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IGlkID0gZWwuZXhwcmVzc2lvbiBhcyB0cy5JZGVudGlmaWVyO1xuXG4gICAgcmV0dXJuIGlkZW50aWZpZXJJc01ldGFkYXRhKGlkLCBuZ01ldGFkYXRhLCBjaGVja2VyKTtcbiAgfSk7XG5cbiAgLy8gT25seSByZW1vdmUgY29uc3RydWN0b3IgcGFyYW1ldGVyIG1ldGFkYXRhIG9uIG5vbi13aGl0ZWxpc3RlZCBjbGFzc2VzLlxuICBpZiAocGxhdGZvcm1XaGl0ZWxpc3QuaW5kZXhPZihjbGFzc0lkLnRleHQpID09PSAtMSkge1xuICAgIC8vIFJlbW92ZSBfX21ldGFkYXRhIGNhbGxzIG9mIHR5cGUgJ2Rlc2lnbjpwYXJhbXR5cGVzJy5cbiAgICBjb25zdCBtZXRhZGF0YUNhbGxzID0gZWxlbWVudHMuZmlsdGVyKChlbCkgPT4ge1xuICAgICAgaWYgKCFpc1RzbGliSGVscGVyKGVsLCAnX19tZXRhZGF0YScsIHRzbGliSW1wb3J0cywgY2hlY2tlcikpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgaWYgKGVsLmFyZ3VtZW50cy5sZW5ndGggPCAyKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIGlmIChlbC5hcmd1bWVudHNbMF0ua2luZCAhPT0gdHMuU3ludGF4S2luZC5TdHJpbmdMaXRlcmFsKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG1ldGFkYXRhVHlwZUlkID0gZWwuYXJndW1lbnRzWzBdIGFzIHRzLlN0cmluZ0xpdGVyYWw7XG4gICAgICBpZiAobWV0YWRhdGFUeXBlSWQudGV4dCAhPT0gJ2Rlc2lnbjpwYXJhbXR5cGVzJykge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0pO1xuICAgIC8vIFJlbW92ZSBhbGwgX19wYXJhbSBjYWxscy5cbiAgICBjb25zdCBwYXJhbUNhbGxzID0gZWxlbWVudHMuZmlsdGVyKChlbCkgPT4ge1xuICAgICAgaWYgKCFpc1RzbGliSGVscGVyKGVsLCAnX19wYXJhbScsIHRzbGliSW1wb3J0cywgY2hlY2tlcikpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgaWYgKGVsLmFyZ3VtZW50cy5sZW5ndGggIT0gMikge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICBpZiAoZWwuYXJndW1lbnRzWzBdLmtpbmQgIT09IHRzLlN5bnRheEtpbmQuTnVtZXJpY0xpdGVyYWwpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcbiAgICBuZ0RlY29yYXRvckNhbGxzLnB1c2goLi4ubWV0YWRhdGFDYWxscywgLi4ucGFyYW1DYWxscyk7XG4gIH1cblxuICAvLyBJZiBhbGwgZGVjb3JhdG9ycyBhcmUgbWV0YWRhdGEgZGVjb3JhdG9ycyB0aGVuIHJldHVybiB0aGUgd2hvbGUgYENsYXNzID0gX19kZWNvcmF0ZShbLi4uXSknYFxuICAvLyBzdGF0ZW1lbnQgc28gdGhhdCBpdCBpcyByZW1vdmVkIGluIGVudGlyZXR5XG4gIHJldHVybiAoZWxlbWVudHMubGVuZ3RoID09PSBuZ0RlY29yYXRvckNhbGxzLmxlbmd0aCkgPyBbZXhwclN0bXRdIDogbmdEZWNvcmF0b3JDYWxscztcbn1cblxuLy8gUmVtb3ZlIEFuZ3VsYXIgZGVjb3JhdG9ycyBmcm9tYENsYXp6LnByb3BEZWNvcmF0b3JzID0gWy4uLl07YCwgb3IgZXhwcmVzc2lvbiBpdHNlbGYgaWYgYWxsXG4vLyBhcmUgcmVtb3ZlZC5cbmZ1bmN0aW9uIHBpY2tQcm9wRGVjb3JhdGlvbk5vZGVzVG9SZW1vdmUoXG4gIGV4cHJTdG10OiB0cy5FeHByZXNzaW9uU3RhdGVtZW50LFxuICBuZ01ldGFkYXRhOiB0cy5Ob2RlW10sXG4gIGNoZWNrZXI6IHRzLlR5cGVDaGVja2VyLFxuKTogdHMuTm9kZVtdIHtcblxuICBjb25zdCBleHByID0gZXhwZWN0PHRzLkJpbmFyeUV4cHJlc3Npb24+KGV4cHJTdG10LmV4cHJlc3Npb24sIHRzLlN5bnRheEtpbmQuQmluYXJ5RXhwcmVzc2lvbik7XG4gIGNvbnN0IGxpdGVyYWwgPSBleHBlY3Q8dHMuT2JqZWN0TGl0ZXJhbEV4cHJlc3Npb24+KGV4cHIucmlnaHQsXG4gICAgdHMuU3ludGF4S2luZC5PYmplY3RMaXRlcmFsRXhwcmVzc2lvbik7XG4gIGlmICghbGl0ZXJhbC5wcm9wZXJ0aWVzLmV2ZXJ5KChlbGVtKSA9PiBlbGVtLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuUHJvcGVydHlBc3NpZ25tZW50ICYmXG4gICAgKGVsZW0gYXMgdHMuUHJvcGVydHlBc3NpZ25tZW50KS5pbml0aWFsaXplci5raW5kID09PSB0cy5TeW50YXhLaW5kLkFycmF5TGl0ZXJhbEV4cHJlc3Npb24pKSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG4gIGNvbnN0IGFzc2lnbm1lbnRzID0gbGl0ZXJhbC5wcm9wZXJ0aWVzIGFzIHRzLk5vZGVBcnJheTx0cy5Qcm9wZXJ0eUFzc2lnbm1lbnQ+O1xuICAvLyBDb25zaWRlciBlYWNoIGFzc2lnbm1lbnQgaW5kaXZpZHVhbGx5LiBFaXRoZXIgdGhlIHdob2xlIGFzc2lnbm1lbnQgd2lsbCBiZSByZW1vdmVkIG9yXG4gIC8vIGEgcGFydGljdWxhciBkZWNvcmF0b3Igd2l0aGluIHdpbGwuXG4gIGNvbnN0IHRvUmVtb3ZlID0gYXNzaWdubWVudHNcbiAgICAubWFwKChhc3NpZ24pID0+IHtcbiAgICAgIGNvbnN0IGRlY29yYXRvcnMgPVxuICAgICAgICBleHBlY3Q8dHMuQXJyYXlMaXRlcmFsRXhwcmVzc2lvbj4oYXNzaWduLmluaXRpYWxpemVyLFxuICAgICAgICAgIHRzLlN5bnRheEtpbmQuQXJyYXlMaXRlcmFsRXhwcmVzc2lvbikuZWxlbWVudHM7XG4gICAgICBpZiAoIWRlY29yYXRvcnMuZXZlcnkoKGVsKSA9PiBlbC5raW5kID09PSB0cy5TeW50YXhLaW5kLk9iamVjdExpdGVyYWxFeHByZXNzaW9uKSkge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgICBjb25zdCBkZWNzVG9SZW1vdmUgPSBkZWNvcmF0b3JzLmZpbHRlcigoZXhwcmVzc2lvbikgPT4ge1xuICAgICAgICBjb25zdCBsaXQgPSBleHBlY3Q8dHMuT2JqZWN0TGl0ZXJhbEV4cHJlc3Npb24+KGV4cHJlc3Npb24sXG4gICAgICAgICAgdHMuU3ludGF4S2luZC5PYmplY3RMaXRlcmFsRXhwcmVzc2lvbik7XG5cbiAgICAgICAgcmV0dXJuIGlzQW5ndWxhckRlY29yYXRvcihsaXQsIG5nTWV0YWRhdGEsIGNoZWNrZXIpO1xuICAgICAgfSk7XG4gICAgICBpZiAoZGVjc1RvUmVtb3ZlLmxlbmd0aCA9PT0gZGVjb3JhdG9ycy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIFthc3NpZ25dO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gZGVjc1RvUmVtb3ZlO1xuICAgIH0pXG4gICAgLnJlZHVjZSgoYWNjdW0sIHRvUm0pID0+IGFjY3VtLmNvbmNhdCh0b1JtKSwgW10gYXMgdHMuTm9kZVtdKTtcbiAgLy8gSWYgZXZlcnkgbm9kZSB0byBiZSByZW1vdmVkIGlzIGEgcHJvcGVydHkgYXNzaWdubWVudCAoZnVsbCBwcm9wZXJ0eSdzIGRlY29yYXRvcnMpIGFuZFxuICAvLyBhbGwgcHJvcGVydGllcyBhcmUgYWNjb3VudGVkIGZvciwgcmVtb3ZlIHRoZSB3aG9sZSBhc3NpZ25tZW50LiBPdGhlcndpc2UsIHJlbW92ZSB0aGVcbiAgLy8gbm9kZXMgd2hpY2ggd2VyZSBtYXJrZWQgYXMgc2FmZS5cbiAgaWYgKHRvUmVtb3ZlLmxlbmd0aCA9PT0gYXNzaWdubWVudHMubGVuZ3RoICYmXG4gICAgdG9SZW1vdmUuZXZlcnkoKG5vZGUpID0+IG5vZGUua2luZCA9PT0gdHMuU3ludGF4S2luZC5Qcm9wZXJ0eUFzc2lnbm1lbnQpKSB7XG4gICAgcmV0dXJuIFtleHByU3RtdF07XG4gIH1cblxuICByZXR1cm4gdG9SZW1vdmU7XG59XG5cbmZ1bmN0aW9uIGlzQW5ndWxhckRlY29yYXRvcihcbiAgbGl0ZXJhbDogdHMuT2JqZWN0TGl0ZXJhbEV4cHJlc3Npb24sXG4gIG5nTWV0YWRhdGE6IHRzLk5vZGVbXSxcbiAgY2hlY2tlcjogdHMuVHlwZUNoZWNrZXIsXG4pOiBib29sZWFuIHtcblxuICBjb25zdCB0eXBlcyA9IGxpdGVyYWwucHJvcGVydGllcy5maWx0ZXIoaXNUeXBlUHJvcGVydHkpO1xuICBpZiAodHlwZXMubGVuZ3RoICE9PSAxKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IGFzc2lnbiA9IGV4cGVjdDx0cy5Qcm9wZXJ0eUFzc2lnbm1lbnQ+KHR5cGVzWzBdLCB0cy5TeW50YXhLaW5kLlByb3BlcnR5QXNzaWdubWVudCk7XG4gIGlmIChhc3NpZ24uaW5pdGlhbGl6ZXIua2luZCAhPT0gdHMuU3ludGF4S2luZC5JZGVudGlmaWVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IGlkID0gYXNzaWduLmluaXRpYWxpemVyIGFzIHRzLklkZW50aWZpZXI7XG4gIGNvbnN0IHJlcyA9IGlkZW50aWZpZXJJc01ldGFkYXRhKGlkLCBuZ01ldGFkYXRhLCBjaGVja2VyKTtcblxuICByZXR1cm4gcmVzO1xufVxuXG5mdW5jdGlvbiBpc1R5cGVQcm9wZXJ0eShwcm9wOiB0cy5PYmplY3RMaXRlcmFsRWxlbWVudCk6IGJvb2xlYW4ge1xuICBpZiAocHJvcC5raW5kICE9PSB0cy5TeW50YXhLaW5kLlByb3BlcnR5QXNzaWdubWVudCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBjb25zdCBhc3NpZ25tZW50ID0gcHJvcCBhcyB0cy5Qcm9wZXJ0eUFzc2lnbm1lbnQ7XG4gIGlmIChhc3NpZ25tZW50Lm5hbWUua2luZCAhPT0gdHMuU3ludGF4S2luZC5JZGVudGlmaWVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGNvbnN0IG5hbWUgPSBhc3NpZ25tZW50Lm5hbWUgYXMgdHMuSWRlbnRpZmllcjtcblxuICByZXR1cm4gbmFtZS50ZXh0ID09PSAndHlwZSc7XG59XG5cbi8vIENoZWNrIGlmIGFuIGlkZW50aWZpZXIgaXMgcGFydCBvZiB0aGUga25vd24gQW5ndWxhciBNZXRhZGF0YS5cbmZ1bmN0aW9uIGlkZW50aWZpZXJJc01ldGFkYXRhKFxuICBpZDogdHMuSWRlbnRpZmllcixcbiAgbWV0YWRhdGE6IHRzLk5vZGVbXSxcbiAgY2hlY2tlcjogdHMuVHlwZUNoZWNrZXIsXG4pOiBib29sZWFuIHtcbiAgY29uc3Qgc3ltYm9sID0gY2hlY2tlci5nZXRTeW1ib2xBdExvY2F0aW9uKGlkKTtcbiAgaWYgKCFzeW1ib2wgfHwgIXN5bWJvbC5kZWNsYXJhdGlvbnMgfHwgIXN5bWJvbC5kZWNsYXJhdGlvbnMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHN5bWJvbFxuICAgIC5kZWNsYXJhdGlvbnNcbiAgICAuc29tZSgoc3BlYykgPT4gbWV0YWRhdGEuaW5kZXhPZihzcGVjKSAhPT0gLTEpO1xufVxuXG4vLyBDaGVjayBpZiBhbiBpbXBvcnQgaXMgYSB0c2xpYiBoZWxwZXIgaW1wb3J0IChgaW1wb3J0ICogYXMgdHNsaWIgZnJvbSBcInRzbGliXCI7YClcbmZ1bmN0aW9uIGlzVHNsaWJJbXBvcnQobm9kZTogdHMuSW1wb3J0RGVjbGFyYXRpb24pOiBib29sZWFuIHtcbiAgcmV0dXJuICEhKG5vZGUubW9kdWxlU3BlY2lmaWVyICYmXG4gICAgbm9kZS5tb2R1bGVTcGVjaWZpZXIua2luZCA9PT0gdHMuU3ludGF4S2luZC5TdHJpbmdMaXRlcmFsICYmXG4gICAgKG5vZGUubW9kdWxlU3BlY2lmaWVyIGFzIHRzLlN0cmluZ0xpdGVyYWwpLnRleHQgPT09ICd0c2xpYicgJiZcbiAgICBub2RlLmltcG9ydENsYXVzZSAmJlxuICAgIG5vZGUuaW1wb3J0Q2xhdXNlLm5hbWVkQmluZGluZ3MgJiZcbiAgICBub2RlLmltcG9ydENsYXVzZS5uYW1lZEJpbmRpbmdzLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuTmFtZXNwYWNlSW1wb3J0KTtcbn1cblxuLy8gRmluZCBhbGwgbmFtZXNwYWNlIGltcG9ydHMgZm9yIGB0c2xpYmAuXG5mdW5jdGlvbiBmaW5kVHNsaWJJbXBvcnRzKG5vZGU6IHRzLk5vZGUpOiB0cy5OYW1lc3BhY2VJbXBvcnRbXSB7XG4gIGNvbnN0IGltcG9ydHM6IHRzLk5hbWVzcGFjZUltcG9ydFtdID0gW107XG4gIHRzLmZvckVhY2hDaGlsZChub2RlLCAoY2hpbGQpID0+IHtcbiAgICBpZiAoY2hpbGQua2luZCA9PT0gdHMuU3ludGF4S2luZC5JbXBvcnREZWNsYXJhdGlvbikge1xuICAgICAgY29uc3QgaW1wb3J0RGVjbCA9IGNoaWxkIGFzIHRzLkltcG9ydERlY2xhcmF0aW9uO1xuICAgICAgaWYgKGlzVHNsaWJJbXBvcnQoaW1wb3J0RGVjbCkpIHtcbiAgICAgICAgY29uc3QgaW1wb3J0Q2xhdXNlID0gaW1wb3J0RGVjbC5pbXBvcnRDbGF1c2UgYXMgdHMuSW1wb3J0Q2xhdXNlO1xuICAgICAgICBjb25zdCBuYW1lc3BhY2VJbXBvcnQgPSBpbXBvcnRDbGF1c2UubmFtZWRCaW5kaW5ncyBhcyB0cy5OYW1lc3BhY2VJbXBvcnQ7XG4gICAgICAgIGltcG9ydHMucHVzaChuYW1lc3BhY2VJbXBvcnQpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIGltcG9ydHM7XG59XG5cbi8vIENoZWNrIGlmIGFuIGlkZW50aWZpZXIgaXMgcGFydCBvZiB0aGUga25vd24gdHNsaWIgaWRlbnRpZmllcnMuXG5mdW5jdGlvbiBpZGVudGlmaWVySXNUc2xpYihcbiAgaWQ6IHRzLklkZW50aWZpZXIsXG4gIHRzbGliSW1wb3J0czogdHMuTmFtZXNwYWNlSW1wb3J0W10sXG4gIGNoZWNrZXI6IHRzLlR5cGVDaGVja2VyLFxuKTogYm9vbGVhbiB7XG4gIGNvbnN0IHN5bWJvbCA9IGNoZWNrZXIuZ2V0U3ltYm9sQXRMb2NhdGlvbihpZCk7XG4gIGlmICghc3ltYm9sIHx8ICFzeW1ib2wuZGVjbGFyYXRpb25zIHx8ICFzeW1ib2wuZGVjbGFyYXRpb25zLmxlbmd0aCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiBzeW1ib2xcbiAgICAuZGVjbGFyYXRpb25zXG4gICAgLnNvbWUoKHNwZWMpID0+IHRzbGliSW1wb3J0cy5pbmRleE9mKHNwZWMgYXMgdHMuTmFtZXNwYWNlSW1wb3J0KSAhPT0gLTEpO1xufVxuXG4vLyBDaGVjayBpZiBhIGZ1bmN0aW9uIGNhbGwgaXMgYSB0c2xpYiBoZWxwZXIuXG5mdW5jdGlvbiBpc1RzbGliSGVscGVyKFxuICBjYWxsRXhwcjogdHMuQ2FsbEV4cHJlc3Npb24sXG4gIGhlbHBlcjogc3RyaW5nLFxuICB0c2xpYkltcG9ydHM6IHRzLk5hbWVzcGFjZUltcG9ydFtdLFxuICBjaGVja2VyOiB0cy5UeXBlQ2hlY2tlcixcbikge1xuXG4gIGxldCBjYWxsRXhwcklkZW50ID0gY2FsbEV4cHIuZXhwcmVzc2lvbiBhcyB0cy5JZGVudGlmaWVyO1xuXG4gIGlmIChjYWxsRXhwci5leHByZXNzaW9uLmtpbmQgIT09IHRzLlN5bnRheEtpbmQuSWRlbnRpZmllcikge1xuICAgIGlmIChjYWxsRXhwci5leHByZXNzaW9uLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKSB7XG4gICAgICBjb25zdCBwcm9wQWNjZXNzID0gY2FsbEV4cHIuZXhwcmVzc2lvbiBhcyB0cy5Qcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb247XG4gICAgICBjb25zdCBsZWZ0ID0gcHJvcEFjY2Vzcy5leHByZXNzaW9uO1xuICAgICAgY2FsbEV4cHJJZGVudCA9IHByb3BBY2Nlc3MubmFtZTtcblxuICAgICAgaWYgKGxlZnQua2luZCAhPT0gdHMuU3ludGF4S2luZC5JZGVudGlmaWVyKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaWQgPSBsZWZ0IGFzIHRzLklkZW50aWZpZXI7XG5cbiAgICAgIGlmICghaWRlbnRpZmllcklzVHNsaWIoaWQsIHRzbGliSW1wb3J0cywgY2hlY2tlcikpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvLyBub2RlLnRleHQgb24gYSBuYW1lIHRoYXQgc3RhcnRzIHdpdGggdHdvIHVuZGVyc2NvcmVzIHdpbGwgcmV0dXJuIHRocmVlIGluc3RlYWQuXG4gIC8vIFVubGVzcyBpdCdzIGFuIGV4cHJlc3Npb24gbGlrZSB0c2xpYi5fX2RlY29yYXRlLCBpbiB3aGljaCBjYXNlIGl0J3Mgb25seSAyLlxuICBpZiAoY2FsbEV4cHJJZGVudC50ZXh0ICE9PSBgXyR7aGVscGVyfWAgJiYgY2FsbEV4cHJJZGVudC50ZXh0ICE9PSBoZWxwZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn1cbiJdfQ==
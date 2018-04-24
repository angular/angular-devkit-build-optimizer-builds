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
function testWrapEnums(content) {
    const regexes = [
        // tslint:disable:max-line-length
        /var (\S+) = \{\};\r?\n(\1\.(\S+) = \d+;\r?\n)+\1\[\1\.(\S+)\] = "\4";\r?\n(\1\[\1\.(\S+)\] = "\S+";\r?\n*)+/,
        /var (\S+);(\/\*@__PURE__\*\/)*\r?\n\(function \(\1\) \{\s+(\1\[\1\["(\S+)"\] = (\S+)\] = "\4";(\s+\1\[\1\["\S+"\] = (\S+)\] = "\S+";)*\r?\n)\}\)\(\1 \|\| \(\1 = \{\}\)\);/,
        /\/\*\* @enum \{\w+\} \*\//,
    ];
    return regexes.some((regex) => regex.test(content));
}
exports.testWrapEnums = testWrapEnums;
function isBlockLike(node) {
    return node.kind === ts.SyntaxKind.Block
        || node.kind === ts.SyntaxKind.ModuleBlock
        || node.kind === ts.SyntaxKind.CaseClause
        || node.kind === ts.SyntaxKind.DefaultClause
        || node.kind === ts.SyntaxKind.SourceFile;
}
function getWrapEnumsTransformer() {
    return (context) => {
        const transformer = (sf) => {
            const result = visitBlockStatements(sf.statements, context);
            return ts.updateSourceFileNode(sf, ts.setTextRange(result, sf.statements));
        };
        return transformer;
    };
}
exports.getWrapEnumsTransformer = getWrapEnumsTransformer;
function visitBlockStatements(statements, context) {
    // copy of statements to modify; lazy initialized
    let updatedStatements;
    const visitor = (node) => {
        if (isBlockLike(node)) {
            let result = visitBlockStatements(node.statements, context);
            if (result === node.statements) {
                return node;
            }
            result = ts.setTextRange(result, node.statements);
            switch (node.kind) {
                case ts.SyntaxKind.Block:
                    return ts.updateBlock(node, result);
                case ts.SyntaxKind.ModuleBlock:
                    return ts.updateModuleBlock(node, result);
                case ts.SyntaxKind.CaseClause:
                    const clause = node;
                    return ts.updateCaseClause(clause, clause.expression, result);
                case ts.SyntaxKind.DefaultClause:
                    return ts.updateDefaultClause(node, result);
                default:
                    return node;
            }
        }
        else {
            return ts.visitEachChild(node, visitor, context);
        }
    };
    // 'oIndex' is the original statement index; 'uIndex' is the updated statement index
    for (let oIndex = 0, uIndex = 0; oIndex < statements.length; oIndex++, uIndex++) {
        const currentStatement = statements[oIndex];
        // these can't contain an enum declaration
        if (currentStatement.kind === ts.SyntaxKind.ImportDeclaration) {
            continue;
        }
        // enum declarations must:
        //   * not be last statement
        //   * be a variable statement
        //   * have only one declaration
        //   * have an identifer as a declaration name
        if (oIndex < statements.length - 1
            && ts.isVariableStatement(currentStatement)
            && currentStatement.declarationList.declarations.length === 1) {
            const variableDeclaration = currentStatement.declarationList.declarations[0];
            if (ts.isIdentifier(variableDeclaration.name)) {
                const name = variableDeclaration.name.text;
                if (!variableDeclaration.initializer) {
                    const iife = findTs2_3EnumIife(name, statements[oIndex + 1]);
                    if (iife) {
                        // found an enum
                        if (!updatedStatements) {
                            updatedStatements = statements.slice();
                        }
                        // update IIFE and replace variable statement and old IIFE
                        updatedStatements.splice(uIndex, 2, updateEnumIife(currentStatement, iife));
                        // skip IIFE statement
                        oIndex++;
                        continue;
                    }
                }
                else if (ts.isObjectLiteralExpression(variableDeclaration.initializer)
                    && variableDeclaration.initializer.properties.length === 0) {
                    const enumStatements = findTs2_2EnumStatements(name, statements, oIndex + 1);
                    if (enumStatements.length > 0) {
                        // found an enum
                        if (!updatedStatements) {
                            updatedStatements = statements.slice();
                        }
                        // create wrapper and replace variable statement and enum member statements
                        updatedStatements.splice(uIndex, enumStatements.length + 1, createWrappedEnum(name, currentStatement, enumStatements, variableDeclaration.initializer));
                        // skip enum member declarations
                        oIndex += enumStatements.length;
                        continue;
                    }
                }
                else if (ts.isObjectLiteralExpression(variableDeclaration.initializer)
                    && variableDeclaration.initializer.properties.length !== 0) {
                    const literalPropertyCount = variableDeclaration.initializer.properties.length;
                    const enumStatements = findTsickleEnumStatements(name, statements, oIndex + 1);
                    if (enumStatements.length === literalPropertyCount) {
                        // found an enum
                        if (!updatedStatements) {
                            updatedStatements = statements.slice();
                        }
                        // create wrapper and replace variable statement and enum member statements
                        updatedStatements.splice(uIndex, enumStatements.length + 1, createWrappedEnum(name, currentStatement, enumStatements, variableDeclaration.initializer));
                        // skip enum member declarations
                        oIndex += enumStatements.length;
                        continue;
                    }
                }
            }
        }
        const result = ts.visitNode(currentStatement, visitor);
        if (result !== currentStatement) {
            if (!updatedStatements) {
                updatedStatements = statements.slice();
            }
            updatedStatements[uIndex] = result;
        }
    }
    // if changes, return updated statements
    // otherwise, return original array instance
    return updatedStatements ? ts.createNodeArray(updatedStatements) : statements;
}
// TS 2.3 enums have statements that are inside a IIFE.
function findTs2_3EnumIife(name, statement) {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) {
        return null;
    }
    const funcExpr = ast_utils_1.drilldownNodes(statement, [
        { prop: null, kind: ts.SyntaxKind.ExpressionStatement },
        { prop: 'expression', kind: ts.SyntaxKind.CallExpression },
        { prop: 'expression', kind: ts.SyntaxKind.ParenthesizedExpression },
        { prop: 'expression', kind: ts.SyntaxKind.FunctionExpression },
    ]);
    if (funcExpr === null) {
        return null;
    }
    if (!(funcExpr.parameters.length === 1
        && funcExpr.parameters[0].name.kind === ts.SyntaxKind.Identifier
        && funcExpr.parameters[0].name.text === name)) {
        return null;
    }
    // In TS 2.3 enums, the IIFE contains only expressions with a certain format.
    // If we find any that is different, we ignore the whole thing.
    for (const innerStmt of funcExpr.body.statements) {
        const innerBinExpr = ast_utils_1.drilldownNodes(innerStmt, [
            { prop: null, kind: ts.SyntaxKind.ExpressionStatement },
            { prop: 'expression', kind: ts.SyntaxKind.BinaryExpression },
        ]);
        if (innerBinExpr === null) {
            return null;
        }
        if (!(innerBinExpr.operatorToken.kind === ts.SyntaxKind.FirstAssignment
            && innerBinExpr.left.kind === ts.SyntaxKind.ElementAccessExpression)) {
            return null;
        }
        const innerElemAcc = innerBinExpr.left;
        if (!(innerElemAcc.expression.kind === ts.SyntaxKind.Identifier
            && innerElemAcc.expression.text === name
            && innerElemAcc.argumentExpression
            && innerElemAcc.argumentExpression.kind === ts.SyntaxKind.BinaryExpression)) {
            return null;
        }
        const innerArgBinExpr = innerElemAcc.argumentExpression;
        if (innerArgBinExpr.left.kind !== ts.SyntaxKind.ElementAccessExpression) {
            return null;
        }
        const innerArgElemAcc = innerArgBinExpr.left;
        if (!(innerArgElemAcc.expression.kind === ts.SyntaxKind.Identifier
            && innerArgElemAcc.expression.text === name)) {
            return null;
        }
    }
    return statement.expression;
}
// TS 2.2 enums have statements after the variable declaration, with index statements followed
// by value statements.
function findTs2_2EnumStatements(name, statements, statementOffset) {
    const enumStatements = [];
    let beforeValueStatements = true;
    for (let index = statementOffset; index < statements.length; index++) {
        // Ensure all statements are of the expected format and using the right identifer.
        // When we find a statement that isn't part of the enum, return what we collected so far.
        const binExpr = ast_utils_1.drilldownNodes(statements[index], [
            { prop: null, kind: ts.SyntaxKind.ExpressionStatement },
            { prop: 'expression', kind: ts.SyntaxKind.BinaryExpression },
        ]);
        if (binExpr === null
            || (binExpr.left.kind !== ts.SyntaxKind.PropertyAccessExpression
                && binExpr.left.kind !== ts.SyntaxKind.ElementAccessExpression)) {
            return beforeValueStatements ? [] : enumStatements;
        }
        const exprStmt = statements[index];
        const leftExpr = binExpr.left;
        if (!(leftExpr.expression.kind === ts.SyntaxKind.Identifier
            && leftExpr.expression.text === name)) {
            return beforeValueStatements ? [] : enumStatements;
        }
        if (!beforeValueStatements && leftExpr.kind === ts.SyntaxKind.PropertyAccessExpression) {
            // We shouldn't find index statements after value statements.
            return [];
        }
        else if (beforeValueStatements && leftExpr.kind === ts.SyntaxKind.ElementAccessExpression) {
            beforeValueStatements = false;
        }
        enumStatements.push(exprStmt);
    }
    return enumStatements;
}
// Tsickle enums have a variable statement with indexes, followed by value statements.
// See https://github.com/angular/devkit/issues/229#issuecomment-338512056 fore more information.
function findTsickleEnumStatements(name, statements, statementOffset) {
    const enumStatements = [];
    for (let index = statementOffset; index < statements.length; index++) {
        // Ensure all statements are of the expected format and using the right identifer.
        // When we find a statement that isn't part of the enum, return what we collected so far.
        const access = ast_utils_1.drilldownNodes(statements[index], [
            { prop: null, kind: ts.SyntaxKind.ExpressionStatement },
            { prop: 'expression', kind: ts.SyntaxKind.BinaryExpression },
            { prop: 'left', kind: ts.SyntaxKind.ElementAccessExpression },
        ]);
        if (!access) {
            break;
        }
        if (!ts.isIdentifier(access.expression) || access.expression.text !== name) {
            break;
        }
        if (!access.argumentExpression || !ts.isPropertyAccessExpression(access.argumentExpression)) {
            break;
        }
        const enumExpression = access.argumentExpression.expression;
        if (!ts.isIdentifier(enumExpression) || enumExpression.text !== name) {
            break;
        }
        enumStatements.push(statements[index]);
    }
    return enumStatements;
}
function updateHostNode(hostNode, expression) {
    const pureFunctionComment = '@__PURE__';
    // Update existing host node with the pure comment before the variable declaration initializer.
    const variableDeclaration = hostNode.declarationList.declarations[0];
    const outerVarStmt = ts.updateVariableStatement(hostNode, hostNode.modifiers, ts.updateVariableDeclarationList(hostNode.declarationList, [
        ts.updateVariableDeclaration(variableDeclaration, variableDeclaration.name, variableDeclaration.type, ts.addSyntheticLeadingComment(expression, ts.SyntaxKind.MultiLineCommentTrivia, pureFunctionComment, false)),
    ]));
    return outerVarStmt;
}
function updateEnumIife(hostNode, iife) {
    if (!ts.isParenthesizedExpression(iife.expression)
        || !ts.isFunctionExpression(iife.expression.expression)) {
        throw new Error('Invalid IIFE Structure');
    }
    const expression = iife.expression.expression;
    const updatedFunction = ts.updateFunctionExpression(expression, expression.modifiers, expression.asteriskToken, expression.name, expression.typeParameters, expression.parameters, expression.type, ts.updateBlock(expression.body, [
        ...expression.body.statements,
        ts.createReturn(expression.parameters[0].name),
    ]));
    const updatedIife = ts.updateCall(iife, ts.updateParen(iife.expression, updatedFunction), iife.typeArguments, [ts.createObjectLiteral()]);
    return updateHostNode(hostNode, updatedIife);
}
function createWrappedEnum(name, hostNode, statements, literalInitializer) {
    literalInitializer = literalInitializer || ts.createObjectLiteral();
    const innerVarStmt = ts.createVariableStatement(undefined, ts.createVariableDeclarationList([
        ts.createVariableDeclaration(name, undefined, literalInitializer),
    ]));
    const innerReturn = ts.createReturn(ts.createIdentifier(name));
    const iife = ts.createImmediatelyInvokedFunctionExpression([
        innerVarStmt,
        ...statements,
        innerReturn,
    ]);
    return updateHostNode(hostNode, ts.createParen(iife));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid3JhcC1lbnVtcy5qcyIsInNvdXJjZVJvb3QiOiIuLyIsInNvdXJjZXMiOlsicGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYnVpbGRfb3B0aW1pemVyL3NyYy90cmFuc2Zvcm1zL3dyYXAtZW51bXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7Ozs7O0dBTUc7QUFDSCxpQ0FBaUM7QUFDakMsb0RBQXNEO0FBR3RELHVCQUE4QixPQUFlO0lBQzNDLE1BQU0sT0FBTyxHQUFHO1FBQ2QsaUNBQWlDO1FBQ2pDLDZHQUE2RztRQUM3Ryw0S0FBNEs7UUFDNUssMkJBQTJCO0tBRTVCLENBQUM7SUFFRixNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBQ3RELENBQUM7QUFWRCxzQ0FVQztBQUVELHFCQUFxQixJQUFhO0lBQ2hDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsS0FBSztXQUNqQyxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsV0FBVztXQUN2QyxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsVUFBVTtXQUN0QyxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYTtXQUN6QyxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDO0FBQ2hELENBQUM7QUFFRDtJQUNFLE1BQU0sQ0FBQyxDQUFDLE9BQWlDLEVBQWlDLEVBQUU7UUFDMUUsTUFBTSxXQUFXLEdBQWtDLENBQUMsRUFBaUIsRUFBRSxFQUFFO1lBRXZFLE1BQU0sTUFBTSxHQUFHLG9CQUFvQixDQUFDLEVBQUUsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFFNUQsTUFBTSxDQUFDLEVBQUUsQ0FB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QUFnQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFFL0QsTUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFDLDBDQUEwQyxDQUFDO1FBQ3pELFlBQVk7UUFDWixHQUFHLFVBQVU7UUFDYixXQUFXO0tBQ1osQ0FBQyxDQUFDO0lBRUgsTUFBTSxDQUFDLGNBQWMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQ3hELENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5pbXBvcnQgKiBhcyB0cyBmcm9tICd0eXBlc2NyaXB0JztcbmltcG9ydCB7IGRyaWxsZG93bk5vZGVzIH0gZnJvbSAnLi4vaGVscGVycy9hc3QtdXRpbHMnO1xuXG5cbmV4cG9ydCBmdW5jdGlvbiB0ZXN0V3JhcEVudW1zKGNvbnRlbnQ6IHN0cmluZykge1xuICBjb25zdCByZWdleGVzID0gW1xuICAgIC8vIHRzbGludDpkaXNhYmxlOm1heC1saW5lLWxlbmd0aFxuICAgIC92YXIgKFxcUyspID0gXFx7XFx9O1xccj9cXG4oXFwxXFwuKFxcUyspID0gXFxkKztcXHI/XFxuKStcXDFcXFtcXDFcXC4oXFxTKylcXF0gPSBcIlxcNFwiO1xccj9cXG4oXFwxXFxbXFwxXFwuKFxcUyspXFxdID0gXCJcXFMrXCI7XFxyP1xcbiopKy8sXG4gICAgL3ZhciAoXFxTKyk7KFxcL1xcKkBfX1BVUkVfX1xcKlxcLykqXFxyP1xcblxcKGZ1bmN0aW9uIFxcKFxcMVxcKSBcXHtcXHMrKFxcMVxcW1xcMVxcW1wiKFxcUyspXCJcXF0gPSAoXFxTKylcXF0gPSBcIlxcNFwiOyhcXHMrXFwxXFxbXFwxXFxbXCJcXFMrXCJcXF0gPSAoXFxTKylcXF0gPSBcIlxcUytcIjspKlxccj9cXG4pXFx9XFwpXFwoXFwxIFxcfFxcfCBcXChcXDEgPSBcXHtcXH1cXClcXCk7LyxcbiAgICAvXFwvXFwqXFwqIEBlbnVtIFxce1xcdytcXH0gXFwqXFwvLyxcbiAgLy8gdHNsaW50OmVuYWJsZTptYXgtbGluZS1sZW5ndGhcbiAgXTtcblxuICByZXR1cm4gcmVnZXhlcy5zb21lKChyZWdleCkgPT4gcmVnZXgudGVzdChjb250ZW50KSk7XG59XG5cbmZ1bmN0aW9uIGlzQmxvY2tMaWtlKG5vZGU6IHRzLk5vZGUpOiBub2RlIGlzIHRzLkJsb2NrTGlrZSB7XG4gIHJldHVybiBub2RlLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuQmxvY2tcbiAgICAgIHx8IG5vZGUua2luZCA9PT0gdHMuU3ludGF4S2luZC5Nb2R1bGVCbG9ja1xuICAgICAgfHwgbm9kZS5raW5kID09PSB0cy5TeW50YXhLaW5kLkNhc2VDbGF1c2VcbiAgICAgIHx8IG5vZGUua2luZCA9PT0gdHMuU3ludGF4S2luZC5EZWZhdWx0Q2xhdXNlXG4gICAgICB8fCBub2RlLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuU291cmNlRmlsZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFdyYXBFbnVtc1RyYW5zZm9ybWVyKCk6IHRzLlRyYW5zZm9ybWVyRmFjdG9yeTx0cy5Tb3VyY2VGaWxlPiB7XG4gIHJldHVybiAoY29udGV4dDogdHMuVHJhbnNmb3JtYXRpb25Db250ZXh0KTogdHMuVHJhbnNmb3JtZXI8dHMuU291cmNlRmlsZT4gPT4ge1xuICAgIGNvbnN0IHRyYW5zZm9ybWVyOiB0cy5UcmFuc2Zvcm1lcjx0cy5Tb3VyY2VGaWxlPiA9IChzZjogdHMuU291cmNlRmlsZSkgPT4ge1xuXG4gICAgICBjb25zdCByZXN1bHQgPSB2aXNpdEJsb2NrU3RhdGVtZW50cyhzZi5zdGF0ZW1lbnRzLCBjb250ZXh0KTtcblxuICAgICAgcmV0dXJuIHRzLnVwZGF0ZVNvdXJjZUZpbGVOb2RlKHNmLCB0cy5zZXRUZXh0UmFuZ2UocmVzdWx0LCBzZi5zdGF0ZW1lbnRzKSk7XG4gICAgfTtcblxuICAgIHJldHVybiB0cmFuc2Zvcm1lcjtcbiAgfTtcbn1cblxuZnVuY3Rpb24gdmlzaXRCbG9ja1N0YXRlbWVudHMoXG4gIHN0YXRlbWVudHM6IHRzLk5vZGVBcnJheTx0cy5TdGF0ZW1lbnQ+LFxuICBjb250ZXh0OiB0cy5UcmFuc2Zvcm1hdGlvbkNvbnRleHQsXG4pOiB0cy5Ob2RlQXJyYXk8dHMuU3RhdGVtZW50PiB7XG5cbiAgLy8gY29weSBvZiBzdGF0ZW1lbnRzIHRvIG1vZGlmeTsgbGF6eSBpbml0aWFsaXplZFxuICBsZXQgdXBkYXRlZFN0YXRlbWVudHM6IEFycmF5PHRzLlN0YXRlbWVudD4gfCB1bmRlZmluZWQ7XG5cbiAgY29uc3QgdmlzaXRvcjogdHMuVmlzaXRvciA9IChub2RlKSA9PiB7XG4gICAgaWYgKGlzQmxvY2tMaWtlKG5vZGUpKSB7XG4gICAgICBsZXQgcmVzdWx0ID0gdmlzaXRCbG9ja1N0YXRlbWVudHMobm9kZS5zdGF0ZW1lbnRzLCBjb250ZXh0KTtcbiAgICAgIGlmIChyZXN1bHQgPT09IG5vZGUuc3RhdGVtZW50cykge1xuICAgICAgICByZXR1cm4gbm9kZTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IHRzLnNldFRleHRSYW5nZShyZXN1bHQsIG5vZGUuc3RhdGVtZW50cyk7XG4gICAgICBzd2l0Y2ggKG5vZGUua2luZCkge1xuICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuQmxvY2s6XG4gICAgICAgICAgcmV0dXJuIHRzLnVwZGF0ZUJsb2NrKG5vZGUgYXMgdHMuQmxvY2ssIHJlc3VsdCk7XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5Nb2R1bGVCbG9jazpcbiAgICAgICAgICByZXR1cm4gdHMudXBkYXRlTW9kdWxlQmxvY2sobm9kZSBhcyB0cy5Nb2R1bGVCbG9jaywgcmVzdWx0KTtcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkNhc2VDbGF1c2U6XG4gICAgICAgICAgY29uc3QgY2xhdXNlID0gbm9kZSBhcyB0cy5DYXNlQ2xhdXNlO1xuXG4gICAgICAgICAgcmV0dXJuIHRzLnVwZGF0ZUNhc2VDbGF1c2UoY2xhdXNlLCBjbGF1c2UuZXhwcmVzc2lvbiwgcmVzdWx0KTtcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkRlZmF1bHRDbGF1c2U6XG4gICAgICAgICAgcmV0dXJuIHRzLnVwZGF0ZURlZmF1bHRDbGF1c2Uobm9kZSBhcyB0cy5EZWZhdWx0Q2xhdXNlLCByZXN1bHQpO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHJldHVybiBub2RlO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdHMudmlzaXRFYWNoQ2hpbGQobm9kZSwgdmlzaXRvciwgY29udGV4dCk7XG4gICAgfVxuICB9O1xuXG4gIC8vICdvSW5kZXgnIGlzIHRoZSBvcmlnaW5hbCBzdGF0ZW1lbnQgaW5kZXg7ICd1SW5kZXgnIGlzIHRoZSB1cGRhdGVkIHN0YXRlbWVudCBpbmRleFxuICBmb3IgKGxldCBvSW5kZXggPSAwLCB1SW5kZXggPSAwOyBvSW5kZXggPCBzdGF0ZW1lbnRzLmxlbmd0aDsgb0luZGV4KyssIHVJbmRleCsrKSB7XG4gICAgY29uc3QgY3VycmVudFN0YXRlbWVudCA9IHN0YXRlbWVudHNbb0luZGV4XTtcblxuICAgIC8vIHRoZXNlIGNhbid0IGNvbnRhaW4gYW4gZW51bSBkZWNsYXJhdGlvblxuICAgIGlmIChjdXJyZW50U3RhdGVtZW50LmtpbmQgPT09IHRzLlN5bnRheEtpbmQuSW1wb3J0RGVjbGFyYXRpb24pIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIGVudW0gZGVjbGFyYXRpb25zIG11c3Q6XG4gICAgLy8gICAqIG5vdCBiZSBsYXN0IHN0YXRlbWVudFxuICAgIC8vICAgKiBiZSBhIHZhcmlhYmxlIHN0YXRlbWVudFxuICAgIC8vICAgKiBoYXZlIG9ubHkgb25lIGRlY2xhcmF0aW9uXG4gICAgLy8gICAqIGhhdmUgYW4gaWRlbnRpZmVyIGFzIGEgZGVjbGFyYXRpb24gbmFtZVxuICAgIGlmIChvSW5kZXggPCBzdGF0ZW1lbnRzLmxlbmd0aCAtIDFcbiAgICAgICAgJiYgdHMuaXNWYXJpYWJsZVN0YXRlbWVudChjdXJyZW50U3RhdGVtZW50KVxuICAgICAgICAmJiBjdXJyZW50U3RhdGVtZW50LmRlY2xhcmF0aW9uTGlzdC5kZWNsYXJhdGlvbnMubGVuZ3RoID09PSAxKSB7XG5cbiAgICAgIGNvbnN0IHZhcmlhYmxlRGVjbGFyYXRpb24gPSBjdXJyZW50U3RhdGVtZW50LmRlY2xhcmF0aW9uTGlzdC5kZWNsYXJhdGlvbnNbMF07XG4gICAgICBpZiAodHMuaXNJZGVudGlmaWVyKHZhcmlhYmxlRGVjbGFyYXRpb24ubmFtZSkpIHtcbiAgICAgICAgY29uc3QgbmFtZSA9IHZhcmlhYmxlRGVjbGFyYXRpb24ubmFtZS50ZXh0O1xuXG4gICAgICAgIGlmICghdmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplcikge1xuICAgICAgICAgIGNvbnN0IGlpZmUgPSBmaW5kVHMyXzNFbnVtSWlmZShuYW1lLCBzdGF0ZW1lbnRzW29JbmRleCArIDFdKTtcbiAgICAgICAgICBpZiAoaWlmZSkge1xuICAgICAgICAgICAgLy8gZm91bmQgYW4gZW51bVxuICAgICAgICAgICAgaWYgKCF1cGRhdGVkU3RhdGVtZW50cykge1xuICAgICAgICAgICAgICB1cGRhdGVkU3RhdGVtZW50cyA9IHN0YXRlbWVudHMuc2xpY2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHVwZGF0ZSBJSUZFIGFuZCByZXBsYWNlIHZhcmlhYmxlIHN0YXRlbWVudCBhbmQgb2xkIElJRkVcbiAgICAgICAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzLnNwbGljZSh1SW5kZXgsIDIsIHVwZGF0ZUVudW1JaWZlKFxuICAgICAgICAgICAgICBjdXJyZW50U3RhdGVtZW50LFxuICAgICAgICAgICAgICBpaWZlLFxuICAgICAgICAgICAgKSk7XG4gICAgICAgICAgICAvLyBza2lwIElJRkUgc3RhdGVtZW50XG4gICAgICAgICAgICBvSW5kZXgrKztcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0cy5pc09iamVjdExpdGVyYWxFeHByZXNzaW9uKHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIpXG4gICAgICAgICAgICAgICAgICAgJiYgdmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplci5wcm9wZXJ0aWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnN0IGVudW1TdGF0ZW1lbnRzID0gZmluZFRzMl8yRW51bVN0YXRlbWVudHMobmFtZSwgc3RhdGVtZW50cywgb0luZGV4ICsgMSk7XG4gICAgICAgICAgaWYgKGVudW1TdGF0ZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vIGZvdW5kIGFuIGVudW1cbiAgICAgICAgICAgIGlmICghdXBkYXRlZFN0YXRlbWVudHMpIHtcbiAgICAgICAgICAgICAgdXBkYXRlZFN0YXRlbWVudHMgPSBzdGF0ZW1lbnRzLnNsaWNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBjcmVhdGUgd3JhcHBlciBhbmQgcmVwbGFjZSB2YXJpYWJsZSBzdGF0ZW1lbnQgYW5kIGVudW0gbWVtYmVyIHN0YXRlbWVudHNcbiAgICAgICAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzLnNwbGljZSh1SW5kZXgsIGVudW1TdGF0ZW1lbnRzLmxlbmd0aCArIDEsIGNyZWF0ZVdyYXBwZWRFbnVtKFxuICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICBjdXJyZW50U3RhdGVtZW50LFxuICAgICAgICAgICAgICBlbnVtU3RhdGVtZW50cyxcbiAgICAgICAgICAgICAgdmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplcixcbiAgICAgICAgICAgICkpO1xuICAgICAgICAgICAgLy8gc2tpcCBlbnVtIG1lbWJlciBkZWNsYXJhdGlvbnNcbiAgICAgICAgICAgIG9JbmRleCArPSBlbnVtU3RhdGVtZW50cy5sZW5ndGg7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodHMuaXNPYmplY3RMaXRlcmFsRXhwcmVzc2lvbih2YXJpYWJsZURlY2xhcmF0aW9uLmluaXRpYWxpemVyKVxuICAgICAgICAgICYmIHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIucHJvcGVydGllcy5sZW5ndGggIT09IDApIHtcbiAgICAgICAgICBjb25zdCBsaXRlcmFsUHJvcGVydHlDb3VudCA9IHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIucHJvcGVydGllcy5sZW5ndGg7XG4gICAgICAgICAgY29uc3QgZW51bVN0YXRlbWVudHMgPSBmaW5kVHNpY2tsZUVudW1TdGF0ZW1lbnRzKG5hbWUsIHN0YXRlbWVudHMsIG9JbmRleCArIDEpO1xuICAgICAgICAgIGlmIChlbnVtU3RhdGVtZW50cy5sZW5ndGggPT09IGxpdGVyYWxQcm9wZXJ0eUNvdW50KSB7XG4gICAgICAgICAgICAvLyBmb3VuZCBhbiBlbnVtXG4gICAgICAgICAgICBpZiAoIXVwZGF0ZWRTdGF0ZW1lbnRzKSB7XG4gICAgICAgICAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzID0gc3RhdGVtZW50cy5zbGljZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gY3JlYXRlIHdyYXBwZXIgYW5kIHJlcGxhY2UgdmFyaWFibGUgc3RhdGVtZW50IGFuZCBlbnVtIG1lbWJlciBzdGF0ZW1lbnRzXG4gICAgICAgICAgICB1cGRhdGVkU3RhdGVtZW50cy5zcGxpY2UodUluZGV4LCBlbnVtU3RhdGVtZW50cy5sZW5ndGggKyAxLCBjcmVhdGVXcmFwcGVkRW51bShcbiAgICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgICAgY3VycmVudFN0YXRlbWVudCxcbiAgICAgICAgICAgICAgZW51bVN0YXRlbWVudHMsXG4gICAgICAgICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIsXG4gICAgICAgICAgICApKTtcbiAgICAgICAgICAgIC8vIHNraXAgZW51bSBtZW1iZXIgZGVjbGFyYXRpb25zXG4gICAgICAgICAgICBvSW5kZXggKz0gZW51bVN0YXRlbWVudHMubGVuZ3RoO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0gdHMudmlzaXROb2RlKGN1cnJlbnRTdGF0ZW1lbnQsIHZpc2l0b3IpO1xuICAgIGlmIChyZXN1bHQgIT09IGN1cnJlbnRTdGF0ZW1lbnQpIHtcbiAgICAgIGlmICghdXBkYXRlZFN0YXRlbWVudHMpIHtcbiAgICAgICAgdXBkYXRlZFN0YXRlbWVudHMgPSBzdGF0ZW1lbnRzLnNsaWNlKCk7XG4gICAgICB9XG4gICAgICB1cGRhdGVkU3RhdGVtZW50c1t1SW5kZXhdID0gcmVzdWx0O1xuICAgIH1cbiAgfVxuXG4gIC8vIGlmIGNoYW5nZXMsIHJldHVybiB1cGRhdGVkIHN0YXRlbWVudHNcbiAgLy8gb3RoZXJ3aXNlLCByZXR1cm4gb3JpZ2luYWwgYXJyYXkgaW5zdGFuY2VcbiAgcmV0dXJuIHVwZGF0ZWRTdGF0ZW1lbnRzID8gdHMuY3JlYXRlTm9kZUFycmF5KHVwZGF0ZWRTdGF0ZW1lbnRzKSA6IHN0YXRlbWVudHM7XG59XG5cbi8vIFRTIDIuMyBlbnVtcyBoYXZlIHN0YXRlbWVudHMgdGhhdCBhcmUgaW5zaWRlIGEgSUlGRS5cbmZ1bmN0aW9uIGZpbmRUczJfM0VudW1JaWZlKG5hbWU6IHN0cmluZywgc3RhdGVtZW50OiB0cy5TdGF0ZW1lbnQpOiB0cy5DYWxsRXhwcmVzc2lvbiB8IG51bGwge1xuICBpZiAoIXRzLmlzRXhwcmVzc2lvblN0YXRlbWVudChzdGF0ZW1lbnQpIHx8ICF0cy5pc0NhbGxFeHByZXNzaW9uKHN0YXRlbWVudC5leHByZXNzaW9uKSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgZnVuY0V4cHIgPSBkcmlsbGRvd25Ob2Rlczx0cy5GdW5jdGlvbkV4cHJlc3Npb24+KHN0YXRlbWVudCxcbiAgICBbXG4gICAgICB7IHByb3A6IG51bGwsIGtpbmQ6IHRzLlN5bnRheEtpbmQuRXhwcmVzc2lvblN0YXRlbWVudCB9LFxuICAgICAgeyBwcm9wOiAnZXhwcmVzc2lvbicsIGtpbmQ6IHRzLlN5bnRheEtpbmQuQ2FsbEV4cHJlc3Npb24gfSxcbiAgICAgIHsgcHJvcDogJ2V4cHJlc3Npb24nLCBraW5kOiB0cy5TeW50YXhLaW5kLlBhcmVudGhlc2l6ZWRFeHByZXNzaW9uIH0sXG4gICAgICB7IHByb3A6ICdleHByZXNzaW9uJywga2luZDogdHMuU3ludGF4S2luZC5GdW5jdGlvbkV4cHJlc3Npb24gfSxcbiAgICBdKTtcblxuICBpZiAoZnVuY0V4cHIgPT09IG51bGwpIHsgcmV0dXJuIG51bGw7IH1cblxuICBpZiAoIShcbiAgICBmdW5jRXhwci5wYXJhbWV0ZXJzLmxlbmd0aCA9PT0gMVxuICAgICYmIGZ1bmNFeHByLnBhcmFtZXRlcnNbMF0ubmFtZS5raW5kID09PSB0cy5TeW50YXhLaW5kLklkZW50aWZpZXJcbiAgICAmJiAoZnVuY0V4cHIucGFyYW1ldGVyc1swXS5uYW1lIGFzIHRzLklkZW50aWZpZXIpLnRleHQgPT09IG5hbWVcbiAgKSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgLy8gSW4gVFMgMi4zIGVudW1zLCB0aGUgSUlGRSBjb250YWlucyBvbmx5IGV4cHJlc3Npb25zIHdpdGggYSBjZXJ0YWluIGZvcm1hdC5cbiAgLy8gSWYgd2UgZmluZCBhbnkgdGhhdCBpcyBkaWZmZXJlbnQsIHdlIGlnbm9yZSB0aGUgd2hvbGUgdGhpbmcuXG4gIGZvciAoY29uc3QgaW5uZXJTdG10IG9mIGZ1bmNFeHByLmJvZHkuc3RhdGVtZW50cykge1xuXG4gICAgY29uc3QgaW5uZXJCaW5FeHByID0gZHJpbGxkb3duTm9kZXM8dHMuQmluYXJ5RXhwcmVzc2lvbj4oaW5uZXJTdG10LFxuICAgICAgW1xuICAgICAgICB7IHByb3A6IG51bGwsIGtpbmQ6IHRzLlN5bnRheEtpbmQuRXhwcmVzc2lvblN0YXRlbWVudCB9LFxuICAgICAgICB7IHByb3A6ICdleHByZXNzaW9uJywga2luZDogdHMuU3ludGF4S2luZC5CaW5hcnlFeHByZXNzaW9uIH0sXG4gICAgICBdKTtcblxuICAgIGlmIChpbm5lckJpbkV4cHIgPT09IG51bGwpIHsgcmV0dXJuIG51bGw7IH1cblxuICAgIGlmICghKGlubmVyQmluRXhwci5vcGVyYXRvclRva2VuLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuRmlyc3RBc3NpZ25tZW50XG4gICAgICAgICYmIGlubmVyQmluRXhwci5sZWZ0LmtpbmQgPT09IHRzLlN5bnRheEtpbmQuRWxlbWVudEFjY2Vzc0V4cHJlc3Npb24pKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBpbm5lckVsZW1BY2MgPSBpbm5lckJpbkV4cHIubGVmdCBhcyB0cy5FbGVtZW50QWNjZXNzRXhwcmVzc2lvbjtcblxuICAgIGlmICghKFxuICAgICAgaW5uZXJFbGVtQWNjLmV4cHJlc3Npb24ua2luZCA9PT0gdHMuU3ludGF4S2luZC5JZGVudGlmaWVyXG4gICAgICAmJiAoaW5uZXJFbGVtQWNjLmV4cHJlc3Npb24gYXMgdHMuSWRlbnRpZmllcikudGV4dCA9PT0gbmFtZVxuICAgICAgJiYgaW5uZXJFbGVtQWNjLmFyZ3VtZW50RXhwcmVzc2lvblxuICAgICAgJiYgaW5uZXJFbGVtQWNjLmFyZ3VtZW50RXhwcmVzc2lvbi5raW5kID09PSB0cy5TeW50YXhLaW5kLkJpbmFyeUV4cHJlc3Npb25cbiAgICApKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBpbm5lckFyZ0JpbkV4cHIgPSBpbm5lckVsZW1BY2MuYXJndW1lbnRFeHByZXNzaW9uIGFzIHRzLkJpbmFyeUV4cHJlc3Npb247XG5cbiAgICBpZiAoaW5uZXJBcmdCaW5FeHByLmxlZnQua2luZCAhPT0gdHMuU3ludGF4S2luZC5FbGVtZW50QWNjZXNzRXhwcmVzc2lvbikge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgaW5uZXJBcmdFbGVtQWNjID0gaW5uZXJBcmdCaW5FeHByLmxlZnQgYXMgdHMuRWxlbWVudEFjY2Vzc0V4cHJlc3Npb247XG5cbiAgICBpZiAoIShcbiAgICAgIGlubmVyQXJnRWxlbUFjYy5leHByZXNzaW9uLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuSWRlbnRpZmllclxuICAgICAgJiYgKGlubmVyQXJnRWxlbUFjYy5leHByZXNzaW9uIGFzIHRzLklkZW50aWZpZXIpLnRleHQgPT09IG5hbWVcbiAgICApKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gc3RhdGVtZW50LmV4cHJlc3Npb247XG59XG5cbi8vIFRTIDIuMiBlbnVtcyBoYXZlIHN0YXRlbWVudHMgYWZ0ZXIgdGhlIHZhcmlhYmxlIGRlY2xhcmF0aW9uLCB3aXRoIGluZGV4IHN0YXRlbWVudHMgZm9sbG93ZWRcbi8vIGJ5IHZhbHVlIHN0YXRlbWVudHMuXG5mdW5jdGlvbiBmaW5kVHMyXzJFbnVtU3RhdGVtZW50cyhcbiAgbmFtZTogc3RyaW5nLFxuICBzdGF0ZW1lbnRzOiB0cy5Ob2RlQXJyYXk8dHMuU3RhdGVtZW50PixcbiAgc3RhdGVtZW50T2Zmc2V0OiBudW1iZXIsXG4pOiB0cy5FeHByZXNzaW9uU3RhdGVtZW50W10ge1xuICBjb25zdCBlbnVtU3RhdGVtZW50czogdHMuRXhwcmVzc2lvblN0YXRlbWVudFtdID0gW107XG4gIGxldCBiZWZvcmVWYWx1ZVN0YXRlbWVudHMgPSB0cnVlO1xuXG4gIGZvciAobGV0IGluZGV4ID0gc3RhdGVtZW50T2Zmc2V0OyBpbmRleCA8IHN0YXRlbWVudHMubGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgLy8gRW5zdXJlIGFsbCBzdGF0ZW1lbnRzIGFyZSBvZiB0aGUgZXhwZWN0ZWQgZm9ybWF0IGFuZCB1c2luZyB0aGUgcmlnaHQgaWRlbnRpZmVyLlxuICAgIC8vIFdoZW4gd2UgZmluZCBhIHN0YXRlbWVudCB0aGF0IGlzbid0IHBhcnQgb2YgdGhlIGVudW0sIHJldHVybiB3aGF0IHdlIGNvbGxlY3RlZCBzbyBmYXIuXG4gICAgY29uc3QgYmluRXhwciA9IGRyaWxsZG93bk5vZGVzPHRzLkJpbmFyeUV4cHJlc3Npb24+KHN0YXRlbWVudHNbaW5kZXhdLFxuICAgICAgW1xuICAgICAgICB7IHByb3A6IG51bGwsIGtpbmQ6IHRzLlN5bnRheEtpbmQuRXhwcmVzc2lvblN0YXRlbWVudCB9LFxuICAgICAgICB7IHByb3A6ICdleHByZXNzaW9uJywga2luZDogdHMuU3ludGF4S2luZC5CaW5hcnlFeHByZXNzaW9uIH0sXG4gICAgICBdKTtcblxuICAgIGlmIChiaW5FeHByID09PSBudWxsXG4gICAgICB8fCAoYmluRXhwci5sZWZ0LmtpbmQgIT09IHRzLlN5bnRheEtpbmQuUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uXG4gICAgICAgICYmIGJpbkV4cHIubGVmdC5raW5kICE9PSB0cy5TeW50YXhLaW5kLkVsZW1lbnRBY2Nlc3NFeHByZXNzaW9uKVxuICAgICkge1xuICAgICAgcmV0dXJuIGJlZm9yZVZhbHVlU3RhdGVtZW50cyA/IFtdIDogZW51bVN0YXRlbWVudHM7XG4gICAgfVxuXG4gICAgY29uc3QgZXhwclN0bXQgPSBzdGF0ZW1lbnRzW2luZGV4XSBhcyB0cy5FeHByZXNzaW9uU3RhdGVtZW50O1xuICAgIGNvbnN0IGxlZnRFeHByID0gYmluRXhwci5sZWZ0IGFzIHRzLlByb3BlcnR5QWNjZXNzRXhwcmVzc2lvbiB8IHRzLkVsZW1lbnRBY2Nlc3NFeHByZXNzaW9uO1xuXG4gICAgaWYgKCEobGVmdEV4cHIuZXhwcmVzc2lvbi5raW5kID09PSB0cy5TeW50YXhLaW5kLklkZW50aWZpZXJcbiAgICAgICAgJiYgKGxlZnRFeHByLmV4cHJlc3Npb24gYXMgdHMuSWRlbnRpZmllcikudGV4dCA9PT0gbmFtZSkpIHtcbiAgICAgIHJldHVybiBiZWZvcmVWYWx1ZVN0YXRlbWVudHMgPyBbXSA6IGVudW1TdGF0ZW1lbnRzO1xuICAgIH1cblxuICAgIGlmICghYmVmb3JlVmFsdWVTdGF0ZW1lbnRzICYmIGxlZnRFeHByLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKSB7XG4gICAgICAvLyBXZSBzaG91bGRuJ3QgZmluZCBpbmRleCBzdGF0ZW1lbnRzIGFmdGVyIHZhbHVlIHN0YXRlbWVudHMuXG4gICAgICByZXR1cm4gW107XG4gICAgfSBlbHNlIGlmIChiZWZvcmVWYWx1ZVN0YXRlbWVudHMgJiYgbGVmdEV4cHIua2luZCA9PT0gdHMuU3ludGF4S2luZC5FbGVtZW50QWNjZXNzRXhwcmVzc2lvbikge1xuICAgICAgYmVmb3JlVmFsdWVTdGF0ZW1lbnRzID0gZmFsc2U7XG4gICAgfVxuXG4gICAgZW51bVN0YXRlbWVudHMucHVzaChleHByU3RtdCk7XG4gIH1cblxuICByZXR1cm4gZW51bVN0YXRlbWVudHM7XG59XG5cbi8vIFRzaWNrbGUgZW51bXMgaGF2ZSBhIHZhcmlhYmxlIHN0YXRlbWVudCB3aXRoIGluZGV4ZXMsIGZvbGxvd2VkIGJ5IHZhbHVlIHN0YXRlbWVudHMuXG4vLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL2FuZ3VsYXIvZGV2a2l0L2lzc3Vlcy8yMjkjaXNzdWVjb21tZW50LTMzODUxMjA1NiBmb3JlIG1vcmUgaW5mb3JtYXRpb24uXG5mdW5jdGlvbiBmaW5kVHNpY2tsZUVudW1TdGF0ZW1lbnRzKFxuICBuYW1lOiBzdHJpbmcsXG4gIHN0YXRlbWVudHM6IHRzLk5vZGVBcnJheTx0cy5TdGF0ZW1lbnQ+LFxuICBzdGF0ZW1lbnRPZmZzZXQ6IG51bWJlcixcbik6IHRzLlN0YXRlbWVudFtdIHtcbiAgY29uc3QgZW51bVN0YXRlbWVudHM6IHRzLlN0YXRlbWVudFtdID0gW107XG5cbiAgZm9yIChsZXQgaW5kZXggPSBzdGF0ZW1lbnRPZmZzZXQ7IGluZGV4IDwgc3RhdGVtZW50cy5sZW5ndGg7IGluZGV4KyspIHtcbiAgICAvLyBFbnN1cmUgYWxsIHN0YXRlbWVudHMgYXJlIG9mIHRoZSBleHBlY3RlZCBmb3JtYXQgYW5kIHVzaW5nIHRoZSByaWdodCBpZGVudGlmZXIuXG4gICAgLy8gV2hlbiB3ZSBmaW5kIGEgc3RhdGVtZW50IHRoYXQgaXNuJ3QgcGFydCBvZiB0aGUgZW51bSwgcmV0dXJuIHdoYXQgd2UgY29sbGVjdGVkIHNvIGZhci5cbiAgICBjb25zdCBhY2Nlc3MgPSBkcmlsbGRvd25Ob2Rlczx0cy5FbGVtZW50QWNjZXNzRXhwcmVzc2lvbj4oc3RhdGVtZW50c1tpbmRleF0sXG4gICAgICBbXG4gICAgICAgIHsgcHJvcDogbnVsbCwga2luZDogdHMuU3ludGF4S2luZC5FeHByZXNzaW9uU3RhdGVtZW50IH0sXG4gICAgICAgIHsgcHJvcDogJ2V4cHJlc3Npb24nLCBraW5kOiB0cy5TeW50YXhLaW5kLkJpbmFyeUV4cHJlc3Npb24gfSxcbiAgICAgICAgeyBwcm9wOiAnbGVmdCcsIGtpbmQ6IHRzLlN5bnRheEtpbmQuRWxlbWVudEFjY2Vzc0V4cHJlc3Npb24gfSxcbiAgICAgIF0pO1xuXG4gICAgaWYgKCFhY2Nlc3MpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGlmICghdHMuaXNJZGVudGlmaWVyKGFjY2Vzcy5leHByZXNzaW9uKSB8fCBhY2Nlc3MuZXhwcmVzc2lvbi50ZXh0ICE9PSBuYW1lKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoIWFjY2Vzcy5hcmd1bWVudEV4cHJlc3Npb24gfHwgIXRzLmlzUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKGFjY2Vzcy5hcmd1bWVudEV4cHJlc3Npb24pKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBjb25zdCBlbnVtRXhwcmVzc2lvbiA9IGFjY2Vzcy5hcmd1bWVudEV4cHJlc3Npb24uZXhwcmVzc2lvbjtcbiAgICBpZiAoIXRzLmlzSWRlbnRpZmllcihlbnVtRXhwcmVzc2lvbikgfHwgZW51bUV4cHJlc3Npb24udGV4dCAhPT0gbmFtZSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgZW51bVN0YXRlbWVudHMucHVzaChzdGF0ZW1lbnRzW2luZGV4XSk7XG4gIH1cblxuICByZXR1cm4gZW51bVN0YXRlbWVudHM7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUhvc3ROb2RlKGhvc3ROb2RlOiB0cy5WYXJpYWJsZVN0YXRlbWVudCwgZXhwcmVzc2lvbjogdHMuRXhwcmVzc2lvbik6IHRzLlN0YXRlbWVudCB7XG4gIGNvbnN0IHB1cmVGdW5jdGlvbkNvbW1lbnQgPSAnQF9fUFVSRV9fJztcblxuICAvLyBVcGRhdGUgZXhpc3RpbmcgaG9zdCBub2RlIHdpdGggdGhlIHB1cmUgY29tbWVudCBiZWZvcmUgdGhlIHZhcmlhYmxlIGRlY2xhcmF0aW9uIGluaXRpYWxpemVyLlxuICBjb25zdCB2YXJpYWJsZURlY2xhcmF0aW9uID0gaG9zdE5vZGUuZGVjbGFyYXRpb25MaXN0LmRlY2xhcmF0aW9uc1swXTtcbiAgY29uc3Qgb3V0ZXJWYXJTdG10ID0gdHMudXBkYXRlVmFyaWFibGVTdGF0ZW1lbnQoXG4gICAgaG9zdE5vZGUsXG4gICAgaG9zdE5vZGUubW9kaWZpZXJzLFxuICAgIHRzLnVwZGF0ZVZhcmlhYmxlRGVjbGFyYXRpb25MaXN0KFxuICAgICAgaG9zdE5vZGUuZGVjbGFyYXRpb25MaXN0LFxuICAgICAgW1xuICAgICAgICB0cy51cGRhdGVWYXJpYWJsZURlY2xhcmF0aW9uKFxuICAgICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24sXG4gICAgICAgICAgdmFyaWFibGVEZWNsYXJhdGlvbi5uYW1lLFxuICAgICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24udHlwZSxcbiAgICAgICAgICB0cy5hZGRTeW50aGV0aWNMZWFkaW5nQ29tbWVudChcbiAgICAgICAgICAgIGV4cHJlc3Npb24sXG4gICAgICAgICAgICB0cy5TeW50YXhLaW5kLk11bHRpTGluZUNvbW1lbnRUcml2aWEsXG4gICAgICAgICAgICBwdXJlRnVuY3Rpb25Db21tZW50LFxuICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgKSxcbiAgICAgICAgKSxcbiAgICAgIF0sXG4gICAgKSxcbiAgKTtcblxuICByZXR1cm4gb3V0ZXJWYXJTdG10O1xufVxuXG5mdW5jdGlvbiB1cGRhdGVFbnVtSWlmZShob3N0Tm9kZTogdHMuVmFyaWFibGVTdGF0ZW1lbnQsIGlpZmU6IHRzLkNhbGxFeHByZXNzaW9uKTogdHMuU3RhdGVtZW50IHtcbiAgaWYgKCF0cy5pc1BhcmVudGhlc2l6ZWRFeHByZXNzaW9uKGlpZmUuZXhwcmVzc2lvbilcbiAgICAgIHx8ICF0cy5pc0Z1bmN0aW9uRXhwcmVzc2lvbihpaWZlLmV4cHJlc3Npb24uZXhwcmVzc2lvbikpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgSUlGRSBTdHJ1Y3R1cmUnKTtcbiAgfVxuXG4gIGNvbnN0IGV4cHJlc3Npb24gPSBpaWZlLmV4cHJlc3Npb24uZXhwcmVzc2lvbjtcbiAgY29uc3QgdXBkYXRlZEZ1bmN0aW9uID0gdHMudXBkYXRlRnVuY3Rpb25FeHByZXNzaW9uKFxuICAgIGV4cHJlc3Npb24sXG4gICAgZXhwcmVzc2lvbi5tb2RpZmllcnMsXG4gICAgZXhwcmVzc2lvbi5hc3Rlcmlza1Rva2VuLFxuICAgIGV4cHJlc3Npb24ubmFtZSxcbiAgICBleHByZXNzaW9uLnR5cGVQYXJhbWV0ZXJzLFxuICAgIGV4cHJlc3Npb24ucGFyYW1ldGVycyxcbiAgICBleHByZXNzaW9uLnR5cGUsXG4gICAgdHMudXBkYXRlQmxvY2soXG4gICAgICBleHByZXNzaW9uLmJvZHksXG4gICAgICBbXG4gICAgICAgIC4uLmV4cHJlc3Npb24uYm9keS5zdGF0ZW1lbnRzLFxuICAgICAgICB0cy5jcmVhdGVSZXR1cm4oZXhwcmVzc2lvbi5wYXJhbWV0ZXJzWzBdLm5hbWUgYXMgdHMuSWRlbnRpZmllciksXG4gICAgICBdLFxuICAgICksXG4gICk7XG5cbiAgY29uc3QgdXBkYXRlZElpZmUgPSB0cy51cGRhdGVDYWxsKFxuICAgIGlpZmUsXG4gICAgdHMudXBkYXRlUGFyZW4oXG4gICAgICBpaWZlLmV4cHJlc3Npb24sXG4gICAgICB1cGRhdGVkRnVuY3Rpb24sXG4gICAgKSxcbiAgICBpaWZlLnR5cGVBcmd1bWVudHMsXG4gICAgW3RzLmNyZWF0ZU9iamVjdExpdGVyYWwoKV0sXG4gICk7XG5cbiAgcmV0dXJuIHVwZGF0ZUhvc3ROb2RlKGhvc3ROb2RlLCB1cGRhdGVkSWlmZSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVdyYXBwZWRFbnVtKFxuICBuYW1lOiBzdHJpbmcsXG4gIGhvc3ROb2RlOiB0cy5WYXJpYWJsZVN0YXRlbWVudCxcbiAgc3RhdGVtZW50czogQXJyYXk8dHMuU3RhdGVtZW50PixcbiAgbGl0ZXJhbEluaXRpYWxpemVyOiB0cy5PYmplY3RMaXRlcmFsRXhwcmVzc2lvbiB8IHVuZGVmaW5lZCxcbik6IHRzLlN0YXRlbWVudCB7XG4gIGxpdGVyYWxJbml0aWFsaXplciA9IGxpdGVyYWxJbml0aWFsaXplciB8fCB0cy5jcmVhdGVPYmplY3RMaXRlcmFsKCk7XG4gIGNvbnN0IGlubmVyVmFyU3RtdCA9IHRzLmNyZWF0ZVZhcmlhYmxlU3RhdGVtZW50KFxuICAgIHVuZGVmaW5lZCxcbiAgICB0cy5jcmVhdGVWYXJpYWJsZURlY2xhcmF0aW9uTGlzdChbXG4gICAgICB0cy5jcmVhdGVWYXJpYWJsZURlY2xhcmF0aW9uKG5hbWUsIHVuZGVmaW5lZCwgbGl0ZXJhbEluaXRpYWxpemVyKSxcbiAgICBdKSxcbiAgKTtcblxuICBjb25zdCBpbm5lclJldHVybiA9IHRzLmNyZWF0ZVJldHVybih0cy5jcmVhdGVJZGVudGlmaWVyKG5hbWUpKTtcblxuICBjb25zdCBpaWZlID0gdHMuY3JlYXRlSW1tZWRpYXRlbHlJbnZva2VkRnVuY3Rpb25FeHByZXNzaW9uKFtcbiAgICBpbm5lclZhclN0bXQsXG4gICAgLi4uc3RhdGVtZW50cyxcbiAgICBpbm5lclJldHVybixcbiAgXSk7XG5cbiAgcmV0dXJuIHVwZGF0ZUhvc3ROb2RlKGhvc3ROb2RlLCB0cy5jcmVhdGVQYXJlbihpaWZlKSk7XG59XG4iXX0=
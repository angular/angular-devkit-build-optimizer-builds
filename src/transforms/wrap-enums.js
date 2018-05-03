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
    const ts22EnumVarDecl = /var (\S+) = \{\};/;
    // tslint:disable-next-line:max-line-length
    const ts22EnumIife = /(\1\.(\S+) = \d+;\r?\n)+\1\[\1\.(\S+)\] = "\4";\r?\n(\1\[\1\.(\S+)\] = "\S+";\r?\n*)+/;
    const ts23To26VarDecl = /var (\S+);(\/\*@__PURE__\*\/)*/;
    // tslint:disable-next-line:max-line-length
    const ts23To26Iife = /\(function \(\1\) \{\s+(\1\[\1\["(\S+)"\] = (\S+)\] = "\4";(\s+\1\[\1\["\S+"\] = (\S+)\] = "\S+";)*\r?\n)\}\)\(\1 \|\| \(\1 = \{\}\)\);/;
    const enumComment = /\/\*\* @enum \{\w+\} \*\//;
    const multiLineComment = /\s*(?:\/\*[\s\S]*?\*\/)?\s*/;
    const newLine = /\s*\r?\n\s*/;
    const regexes = [
        [
            ts22EnumVarDecl,
            newLine, multiLineComment,
            ts22EnumIife,
        ],
        [
            ts23To26VarDecl,
            newLine, multiLineComment,
            ts23To26Iife,
        ],
        [enumComment],
    ].map(arr => new RegExp(arr.map(x => x.source).join(''), 'm'));
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
                    const enumStatements = findEnumNameStatements(name, statements, oIndex + 1);
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
    const enumValueStatements = [];
    const memberNames = [];
    let index = statementOffset;
    for (; index < statements.length; ++index) {
        // Ensure all statements are of the expected format and using the right identifer.
        // When we find a statement that isn't part of the enum, return what we collected so far.
        const current = statements[index];
        if (!ts.isExpressionStatement(current) || !ts.isBinaryExpression(current.expression)) {
            break;
        }
        const property = current.expression.left;
        if (!property || !ts.isPropertyAccessExpression(property)) {
            break;
        }
        if (!ts.isIdentifier(property.expression) || property.expression.text !== name) {
            break;
        }
        memberNames.push(property.name.text);
        enumValueStatements.push(current);
    }
    if (enumValueStatements.length === 0) {
        return [];
    }
    const enumNameStatements = findEnumNameStatements(name, statements, index, memberNames);
    if (enumNameStatements.length !== enumValueStatements.length) {
        return [];
    }
    return enumValueStatements.concat(enumNameStatements);
}
// Tsickle enums have a variable statement with indexes, followed by value statements.
// See https://github.com/angular/devkit/issues/229#issuecomment-338512056 fore more information.
function findEnumNameStatements(name, statements, statementOffset, memberNames) {
    const enumStatements = [];
    for (let index = statementOffset; index < statements.length; ++index) {
        // Ensure all statements are of the expected format and using the right identifer.
        // When we find a statement that isn't part of the enum, return what we collected so far.
        const current = statements[index];
        if (!ts.isExpressionStatement(current) || !ts.isBinaryExpression(current.expression)) {
            break;
        }
        const access = current.expression.left;
        const value = current.expression.right;
        if (!access || !ts.isElementAccessExpression(access) || !value || !ts.isStringLiteral(value)) {
            break;
        }
        if (memberNames && !memberNames.includes(value.text)) {
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
        if (value.text !== access.argumentExpression.name.text) {
            break;
        }
        enumStatements.push(current);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid3JhcC1lbnVtcy5qcyIsInNvdXJjZVJvb3QiOiIuLyIsInNvdXJjZXMiOlsicGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYnVpbGRfb3B0aW1pemVyL3NyYy90cmFuc2Zvcm1zL3dyYXAtZW51bXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7Ozs7O0dBTUc7QUFDSCxpQ0FBaUM7QUFDakMsb0RBQXNEO0FBR3RELHVCQUE4QixPQUFlO0lBQzNDLE1BQU0sZUFBZSxHQUFHLG1CQUFtQixDQUFDO0lBQzVDLDJDQUEyQztJQUMzQyxNQUFNLFlBQVksR0FBRyx1RkFBdUYsQ0FBQztJQUM3RyxNQUFNLGVBQWUsR0FBRyxnQ0FBZ0MsQ0FBQztJQUN6RCwyQ0FBMkM7SUFDM0MsTUFBTSxZQUFZLEdBQUcseUlBQXlJLENBQUM7SUFDL0osTUFBTSxXQUFXLEdBQUcsMkJBQTJCLENBQUM7SUFDaEQsTUFBTSxnQkFBZ0IsR0FBRyw2QkFBNkIsQ0FBQztJQUN2RCxNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUM7SUFFOUIsTUFBTSxPQUFPLEdBQUc7UUFDZDtZQUNFLGVBQWU7WUFDZixPQUFPLEVBQUUsZ0JBQWdCO1lBQ3pCLFlBQVk7U0FDYjtRQUNEO1lBQ0UsZUFBZTtZQUNmLE9BQU8sRUFBRSxnQkFBZ0I7WUFDekIsWUFBWTtTQUNiO1FBQ0QsQ0FBQyxXQUFXLENBQUM7S0FDZCxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFFL0QsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUN0RCxDQUFD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bmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuaW1wb3J0ICogYXMgdHMgZnJvbSAndHlwZXNjcmlwdCc7XG5pbXBvcnQgeyBkcmlsbGRvd25Ob2RlcyB9IGZyb20gJy4uL2hlbHBlcnMvYXN0LXV0aWxzJztcblxuXG5leHBvcnQgZnVuY3Rpb24gdGVzdFdyYXBFbnVtcyhjb250ZW50OiBzdHJpbmcpIHtcbiAgY29uc3QgdHMyMkVudW1WYXJEZWNsID0gL3ZhciAoXFxTKykgPSBcXHtcXH07LztcbiAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOm1heC1saW5lLWxlbmd0aFxuICBjb25zdCB0czIyRW51bUlpZmUgPSAvKFxcMVxcLihcXFMrKSA9IFxcZCs7XFxyP1xcbikrXFwxXFxbXFwxXFwuKFxcUyspXFxdID0gXCJcXDRcIjtcXHI/XFxuKFxcMVxcW1xcMVxcLihcXFMrKVxcXSA9IFwiXFxTK1wiO1xccj9cXG4qKSsvO1xuICBjb25zdCB0czIzVG8yNlZhckRlY2wgPSAvdmFyIChcXFMrKTsoXFwvXFwqQF9fUFVSRV9fXFwqXFwvKSovO1xuICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6bWF4LWxpbmUtbGVuZ3RoXG4gIGNvbnN0IHRzMjNUbzI2SWlmZSA9IC9cXChmdW5jdGlvbiBcXChcXDFcXCkgXFx7XFxzKyhcXDFcXFtcXDFcXFtcIihcXFMrKVwiXFxdID0gKFxcUyspXFxdID0gXCJcXDRcIjsoXFxzK1xcMVxcW1xcMVxcW1wiXFxTK1wiXFxdID0gKFxcUyspXFxdID0gXCJcXFMrXCI7KSpcXHI/XFxuKVxcfVxcKVxcKFxcMSBcXHxcXHwgXFwoXFwxID0gXFx7XFx9XFwpXFwpOy87XG4gIGNvbnN0IGVudW1Db21tZW50ID0gL1xcL1xcKlxcKiBAZW51bSBcXHtcXHcrXFx9IFxcKlxcLy87XG4gIGNvbnN0IG11bHRpTGluZUNvbW1lbnQgPSAvXFxzKig/OlxcL1xcKltcXHNcXFNdKj9cXCpcXC8pP1xccyovO1xuICBjb25zdCBuZXdMaW5lID0gL1xccypcXHI/XFxuXFxzKi87XG5cbiAgY29uc3QgcmVnZXhlcyA9IFtcbiAgICBbXG4gICAgICB0czIyRW51bVZhckRlY2wsXG4gICAgICBuZXdMaW5lLCBtdWx0aUxpbmVDb21tZW50LFxuICAgICAgdHMyMkVudW1JaWZlLFxuICAgIF0sXG4gICAgW1xuICAgICAgdHMyM1RvMjZWYXJEZWNsLFxuICAgICAgbmV3TGluZSwgbXVsdGlMaW5lQ29tbWVudCxcbiAgICAgIHRzMjNUbzI2SWlmZSxcbiAgICBdLFxuICAgIFtlbnVtQ29tbWVudF0sXG4gIF0ubWFwKGFyciA9PiBuZXcgUmVnRXhwKGFyci5tYXAoeCA9PiB4LnNvdXJjZSkuam9pbignJyksICdtJykpO1xuXG4gIHJldHVybiByZWdleGVzLnNvbWUoKHJlZ2V4KSA9PiByZWdleC50ZXN0KGNvbnRlbnQpKTtcbn1cblxuZnVuY3Rpb24gaXNCbG9ja0xpa2Uobm9kZTogdHMuTm9kZSk6IG5vZGUgaXMgdHMuQmxvY2tMaWtlIHtcbiAgcmV0dXJuIG5vZGUua2luZCA9PT0gdHMuU3ludGF4S2luZC5CbG9ja1xuICAgICAgfHwgbm9kZS5raW5kID09PSB0cy5TeW50YXhLaW5kLk1vZHVsZUJsb2NrXG4gICAgICB8fCBub2RlLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuQ2FzZUNsYXVzZVxuICAgICAgfHwgbm9kZS5raW5kID09PSB0cy5TeW50YXhLaW5kLkRlZmF1bHRDbGF1c2VcbiAgICAgIHx8IG5vZGUua2luZCA9PT0gdHMuU3ludGF4S2luZC5Tb3VyY2VGaWxlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0V3JhcEVudW1zVHJhbnNmb3JtZXIoKTogdHMuVHJhbnNmb3JtZXJGYWN0b3J5PHRzLlNvdXJjZUZpbGU+IHtcbiAgcmV0dXJuIChjb250ZXh0OiB0cy5UcmFuc2Zvcm1hdGlvbkNvbnRleHQpOiB0cy5UcmFuc2Zvcm1lcjx0cy5Tb3VyY2VGaWxlPiA9PiB7XG4gICAgY29uc3QgdHJhbnNmb3JtZXI6IHRzLlRyYW5zZm9ybWVyPHRzLlNvdXJjZUZpbGU+ID0gKHNmOiB0cy5Tb3VyY2VGaWxlKSA9PiB7XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IHZpc2l0QmxvY2tTdGF0ZW1lbnRzKHNmLnN0YXRlbWVudHMsIGNvbnRleHQpO1xuXG4gICAgICByZXR1cm4gdHMudXBkYXRlU291cmNlRmlsZU5vZGUoc2YsIHRzLnNldFRleHRSYW5nZShyZXN1bHQsIHNmLnN0YXRlbWVudHMpKTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRyYW5zZm9ybWVyO1xuICB9O1xufVxuXG5mdW5jdGlvbiB2aXNpdEJsb2NrU3RhdGVtZW50cyhcbiAgc3RhdGVtZW50czogdHMuTm9kZUFycmF5PHRzLlN0YXRlbWVudD4sXG4gIGNvbnRleHQ6IHRzLlRyYW5zZm9ybWF0aW9uQ29udGV4dCxcbik6IHRzLk5vZGVBcnJheTx0cy5TdGF0ZW1lbnQ+IHtcblxuICAvLyBjb3B5IG9mIHN0YXRlbWVudHMgdG8gbW9kaWZ5OyBsYXp5IGluaXRpYWxpemVkXG4gIGxldCB1cGRhdGVkU3RhdGVtZW50czogQXJyYXk8dHMuU3RhdGVtZW50PiB8IHVuZGVmaW5lZDtcblxuICBjb25zdCB2aXNpdG9yOiB0cy5WaXNpdG9yID0gKG5vZGUpID0+IHtcbiAgICBpZiAoaXNCbG9ja0xpa2Uobm9kZSkpIHtcbiAgICAgIGxldCByZXN1bHQgPSB2aXNpdEJsb2NrU3RhdGVtZW50cyhub2RlLnN0YXRlbWVudHMsIGNvbnRleHQpO1xuICAgICAgaWYgKHJlc3VsdCA9PT0gbm9kZS5zdGF0ZW1lbnRzKSB7XG4gICAgICAgIHJldHVybiBub2RlO1xuICAgICAgfVxuICAgICAgcmVzdWx0ID0gdHMuc2V0VGV4dFJhbmdlKHJlc3VsdCwgbm9kZS5zdGF0ZW1lbnRzKTtcbiAgICAgIHN3aXRjaCAobm9kZS5raW5kKSB7XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5CbG9jazpcbiAgICAgICAgICByZXR1cm4gdHMudXBkYXRlQmxvY2sobm9kZSBhcyB0cy5CbG9jaywgcmVzdWx0KTtcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLk1vZHVsZUJsb2NrOlxuICAgICAgICAgIHJldHVybiB0cy51cGRhdGVNb2R1bGVCbG9jayhub2RlIGFzIHRzLk1vZHVsZUJsb2NrLCByZXN1bHQpO1xuICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuQ2FzZUNsYXVzZTpcbiAgICAgICAgICBjb25zdCBjbGF1c2UgPSBub2RlIGFzIHRzLkNhc2VDbGF1c2U7XG5cbiAgICAgICAgICByZXR1cm4gdHMudXBkYXRlQ2FzZUNsYXVzZShjbGF1c2UsIGNsYXVzZS5leHByZXNzaW9uLCByZXN1bHQpO1xuICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuRGVmYXVsdENsYXVzZTpcbiAgICAgICAgICByZXR1cm4gdHMudXBkYXRlRGVmYXVsdENsYXVzZShub2RlIGFzIHRzLkRlZmF1bHRDbGF1c2UsIHJlc3VsdCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgcmV0dXJuIG5vZGU7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0cy52aXNpdEVhY2hDaGlsZChub2RlLCB2aXNpdG9yLCBjb250ZXh0KTtcbiAgICB9XG4gIH07XG5cbiAgLy8gJ29JbmRleCcgaXMgdGhlIG9yaWdpbmFsIHN0YXRlbWVudCBpbmRleDsgJ3VJbmRleCcgaXMgdGhlIHVwZGF0ZWQgc3RhdGVtZW50IGluZGV4XG4gIGZvciAobGV0IG9JbmRleCA9IDAsIHVJbmRleCA9IDA7IG9JbmRleCA8IHN0YXRlbWVudHMubGVuZ3RoOyBvSW5kZXgrKywgdUluZGV4KyspIHtcbiAgICBjb25zdCBjdXJyZW50U3RhdGVtZW50ID0gc3RhdGVtZW50c1tvSW5kZXhdO1xuXG4gICAgLy8gdGhlc2UgY2FuJ3QgY29udGFpbiBhbiBlbnVtIGRlY2xhcmF0aW9uXG4gICAgaWYgKGN1cnJlbnRTdGF0ZW1lbnQua2luZCA9PT0gdHMuU3ludGF4S2luZC5JbXBvcnREZWNsYXJhdGlvbikge1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gZW51bSBkZWNsYXJhdGlvbnMgbXVzdDpcbiAgICAvLyAgICogbm90IGJlIGxhc3Qgc3RhdGVtZW50XG4gICAgLy8gICAqIGJlIGEgdmFyaWFibGUgc3RhdGVtZW50XG4gICAgLy8gICAqIGhhdmUgb25seSBvbmUgZGVjbGFyYXRpb25cbiAgICAvLyAgICogaGF2ZSBhbiBpZGVudGlmZXIgYXMgYSBkZWNsYXJhdGlvbiBuYW1lXG4gICAgaWYgKG9JbmRleCA8IHN0YXRlbWVudHMubGVuZ3RoIC0gMVxuICAgICAgICAmJiB0cy5pc1ZhcmlhYmxlU3RhdGVtZW50KGN1cnJlbnRTdGF0ZW1lbnQpXG4gICAgICAgICYmIGN1cnJlbnRTdGF0ZW1lbnQuZGVjbGFyYXRpb25MaXN0LmRlY2xhcmF0aW9ucy5sZW5ndGggPT09IDEpIHtcblxuICAgICAgY29uc3QgdmFyaWFibGVEZWNsYXJhdGlvbiA9IGN1cnJlbnRTdGF0ZW1lbnQuZGVjbGFyYXRpb25MaXN0LmRlY2xhcmF0aW9uc1swXTtcbiAgICAgIGlmICh0cy5pc0lkZW50aWZpZXIodmFyaWFibGVEZWNsYXJhdGlvbi5uYW1lKSkge1xuICAgICAgICBjb25zdCBuYW1lID0gdmFyaWFibGVEZWNsYXJhdGlvbi5uYW1lLnRleHQ7XG5cbiAgICAgICAgaWYgKCF2YXJpYWJsZURlY2xhcmF0aW9uLmluaXRpYWxpemVyKSB7XG4gICAgICAgICAgY29uc3QgaWlmZSA9IGZpbmRUczJfM0VudW1JaWZlKG5hbWUsIHN0YXRlbWVudHNbb0luZGV4ICsgMV0pO1xuICAgICAgICAgIGlmIChpaWZlKSB7XG4gICAgICAgICAgICAvLyBmb3VuZCBhbiBlbnVtXG4gICAgICAgICAgICBpZiAoIXVwZGF0ZWRTdGF0ZW1lbnRzKSB7XG4gICAgICAgICAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzID0gc3RhdGVtZW50cy5zbGljZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gdXBkYXRlIElJRkUgYW5kIHJlcGxhY2UgdmFyaWFibGUgc3RhdGVtZW50IGFuZCBvbGQgSUlGRVxuICAgICAgICAgICAgdXBkYXRlZFN0YXRlbWVudHMuc3BsaWNlKHVJbmRleCwgMiwgdXBkYXRlRW51bUlpZmUoXG4gICAgICAgICAgICAgIGN1cnJlbnRTdGF0ZW1lbnQsXG4gICAgICAgICAgICAgIGlpZmUsXG4gICAgICAgICAgICApKTtcbiAgICAgICAgICAgIC8vIHNraXAgSUlGRSBzdGF0ZW1lbnRcbiAgICAgICAgICAgIG9JbmRleCsrO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHRzLmlzT2JqZWN0TGl0ZXJhbEV4cHJlc3Npb24odmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplcilcbiAgICAgICAgICAgICAgICAgICAmJiB2YXJpYWJsZURlY2xhcmF0aW9uLmluaXRpYWxpemVyLnByb3BlcnRpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY29uc3QgZW51bVN0YXRlbWVudHMgPSBmaW5kVHMyXzJFbnVtU3RhdGVtZW50cyhuYW1lLCBzdGF0ZW1lbnRzLCBvSW5kZXggKyAxKTtcbiAgICAgICAgICBpZiAoZW51bVN0YXRlbWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy8gZm91bmQgYW4gZW51bVxuICAgICAgICAgICAgaWYgKCF1cGRhdGVkU3RhdGVtZW50cykge1xuICAgICAgICAgICAgICB1cGRhdGVkU3RhdGVtZW50cyA9IHN0YXRlbWVudHMuc2xpY2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGNyZWF0ZSB3cmFwcGVyIGFuZCByZXBsYWNlIHZhcmlhYmxlIHN0YXRlbWVudCBhbmQgZW51bSBtZW1iZXIgc3RhdGVtZW50c1xuICAgICAgICAgICAgdXBkYXRlZFN0YXRlbWVudHMuc3BsaWNlKHVJbmRleCwgZW51bVN0YXRlbWVudHMubGVuZ3RoICsgMSwgY3JlYXRlV3JhcHBlZEVudW0oXG4gICAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICAgIGN1cnJlbnRTdGF0ZW1lbnQsXG4gICAgICAgICAgICAgIGVudW1TdGF0ZW1lbnRzLFxuICAgICAgICAgICAgICB2YXJpYWJsZURlY2xhcmF0aW9uLmluaXRpYWxpemVyLFxuICAgICAgICAgICAgKSk7XG4gICAgICAgICAgICAvLyBza2lwIGVudW0gbWVtYmVyIGRlY2xhcmF0aW9uc1xuICAgICAgICAgICAgb0luZGV4ICs9IGVudW1TdGF0ZW1lbnRzLmxlbmd0aDtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0cy5pc09iamVjdExpdGVyYWxFeHByZXNzaW9uKHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIpXG4gICAgICAgICAgJiYgdmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplci5wcm9wZXJ0aWVzLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgIGNvbnN0IGxpdGVyYWxQcm9wZXJ0eUNvdW50ID0gdmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplci5wcm9wZXJ0aWVzLmxlbmd0aDtcbiAgICAgICAgICBjb25zdCBlbnVtU3RhdGVtZW50cyA9IGZpbmRFbnVtTmFtZVN0YXRlbWVudHMobmFtZSwgc3RhdGVtZW50cywgb0luZGV4ICsgMSk7XG4gICAgICAgICAgaWYgKGVudW1TdGF0ZW1lbnRzLmxlbmd0aCA9PT0gbGl0ZXJhbFByb3BlcnR5Q291bnQpIHtcbiAgICAgICAgICAgIC8vIGZvdW5kIGFuIGVudW1cbiAgICAgICAgICAgIGlmICghdXBkYXRlZFN0YXRlbWVudHMpIHtcbiAgICAgICAgICAgICAgdXBkYXRlZFN0YXRlbWVudHMgPSBzdGF0ZW1lbnRzLnNsaWNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBjcmVhdGUgd3JhcHBlciBhbmQgcmVwbGFjZSB2YXJpYWJsZSBzdGF0ZW1lbnQgYW5kIGVudW0gbWVtYmVyIHN0YXRlbWVudHNcbiAgICAgICAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzLnNwbGljZSh1SW5kZXgsIGVudW1TdGF0ZW1lbnRzLmxlbmd0aCArIDEsIGNyZWF0ZVdyYXBwZWRFbnVtKFxuICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICBjdXJyZW50U3RhdGVtZW50LFxuICAgICAgICAgICAgICBlbnVtU3RhdGVtZW50cyxcbiAgICAgICAgICAgICAgdmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplcixcbiAgICAgICAgICAgICkpO1xuICAgICAgICAgICAgLy8gc2tpcCBlbnVtIG1lbWJlciBkZWNsYXJhdGlvbnNcbiAgICAgICAgICAgIG9JbmRleCArPSBlbnVtU3RhdGVtZW50cy5sZW5ndGg7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHQgPSB0cy52aXNpdE5vZGUoY3VycmVudFN0YXRlbWVudCwgdmlzaXRvcik7XG4gICAgaWYgKHJlc3VsdCAhPT0gY3VycmVudFN0YXRlbWVudCkge1xuICAgICAgaWYgKCF1cGRhdGVkU3RhdGVtZW50cykge1xuICAgICAgICB1cGRhdGVkU3RhdGVtZW50cyA9IHN0YXRlbWVudHMuc2xpY2UoKTtcbiAgICAgIH1cbiAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzW3VJbmRleF0gPSByZXN1bHQ7XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgY2hhbmdlcywgcmV0dXJuIHVwZGF0ZWQgc3RhdGVtZW50c1xuICAvLyBvdGhlcndpc2UsIHJldHVybiBvcmlnaW5hbCBhcnJheSBpbnN0YW5jZVxuICByZXR1cm4gdXBkYXRlZFN0YXRlbWVudHMgPyB0cy5jcmVhdGVOb2RlQXJyYXkodXBkYXRlZFN0YXRlbWVudHMpIDogc3RhdGVtZW50cztcbn1cblxuLy8gVFMgMi4zIGVudW1zIGhhdmUgc3RhdGVtZW50cyB0aGF0IGFyZSBpbnNpZGUgYSBJSUZFLlxuZnVuY3Rpb24gZmluZFRzMl8zRW51bUlpZmUobmFtZTogc3RyaW5nLCBzdGF0ZW1lbnQ6IHRzLlN0YXRlbWVudCk6IHRzLkNhbGxFeHByZXNzaW9uIHwgbnVsbCB7XG4gIGlmICghdHMuaXNFeHByZXNzaW9uU3RhdGVtZW50KHN0YXRlbWVudCkgfHwgIXRzLmlzQ2FsbEV4cHJlc3Npb24oc3RhdGVtZW50LmV4cHJlc3Npb24pKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBmdW5jRXhwciA9IGRyaWxsZG93bk5vZGVzPHRzLkZ1bmN0aW9uRXhwcmVzc2lvbj4oc3RhdGVtZW50LFxuICAgIFtcbiAgICAgIHsgcHJvcDogbnVsbCwga2luZDogdHMuU3ludGF4S2luZC5FeHByZXNzaW9uU3RhdGVtZW50IH0sXG4gICAgICB7IHByb3A6ICdleHByZXNzaW9uJywga2luZDogdHMuU3ludGF4S2luZC5DYWxsRXhwcmVzc2lvbiB9LFxuICAgICAgeyBwcm9wOiAnZXhwcmVzc2lvbicsIGtpbmQ6IHRzLlN5bnRheEtpbmQuUGFyZW50aGVzaXplZEV4cHJlc3Npb24gfSxcbiAgICAgIHsgcHJvcDogJ2V4cHJlc3Npb24nLCBraW5kOiB0cy5TeW50YXhLaW5kLkZ1bmN0aW9uRXhwcmVzc2lvbiB9LFxuICAgIF0pO1xuXG4gIGlmIChmdW5jRXhwciA9PT0gbnVsbCkgeyByZXR1cm4gbnVsbDsgfVxuXG4gIGlmICghKFxuICAgIGZ1bmNFeHByLnBhcmFtZXRlcnMubGVuZ3RoID09PSAxXG4gICAgJiYgZnVuY0V4cHIucGFyYW1ldGVyc1swXS5uYW1lLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuSWRlbnRpZmllclxuICAgICYmIChmdW5jRXhwci5wYXJhbWV0ZXJzWzBdLm5hbWUgYXMgdHMuSWRlbnRpZmllcikudGV4dCA9PT0gbmFtZVxuICApKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvLyBJbiBUUyAyLjMgZW51bXMsIHRoZSBJSUZFIGNvbnRhaW5zIG9ubHkgZXhwcmVzc2lvbnMgd2l0aCBhIGNlcnRhaW4gZm9ybWF0LlxuICAvLyBJZiB3ZSBmaW5kIGFueSB0aGF0IGlzIGRpZmZlcmVudCwgd2UgaWdub3JlIHRoZSB3aG9sZSB0aGluZy5cbiAgZm9yIChjb25zdCBpbm5lclN0bXQgb2YgZnVuY0V4cHIuYm9keS5zdGF0ZW1lbnRzKSB7XG5cbiAgICBjb25zdCBpbm5lckJpbkV4cHIgPSBkcmlsbGRvd25Ob2Rlczx0cy5CaW5hcnlFeHByZXNzaW9uPihpbm5lclN0bXQsXG4gICAgICBbXG4gICAgICAgIHsgcHJvcDogbnVsbCwga2luZDogdHMuU3ludGF4S2luZC5FeHByZXNzaW9uU3RhdGVtZW50IH0sXG4gICAgICAgIHsgcHJvcDogJ2V4cHJlc3Npb24nLCBraW5kOiB0cy5TeW50YXhLaW5kLkJpbmFyeUV4cHJlc3Npb24gfSxcbiAgICAgIF0pO1xuXG4gICAgaWYgKGlubmVyQmluRXhwciA9PT0gbnVsbCkgeyByZXR1cm4gbnVsbDsgfVxuXG4gICAgaWYgKCEoaW5uZXJCaW5FeHByLm9wZXJhdG9yVG9rZW4ua2luZCA9PT0gdHMuU3ludGF4S2luZC5GaXJzdEFzc2lnbm1lbnRcbiAgICAgICAgJiYgaW5uZXJCaW5FeHByLmxlZnQua2luZCA9PT0gdHMuU3ludGF4S2luZC5FbGVtZW50QWNjZXNzRXhwcmVzc2lvbikpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IGlubmVyRWxlbUFjYyA9IGlubmVyQmluRXhwci5sZWZ0IGFzIHRzLkVsZW1lbnRBY2Nlc3NFeHByZXNzaW9uO1xuXG4gICAgaWYgKCEoXG4gICAgICBpbm5lckVsZW1BY2MuZXhwcmVzc2lvbi5raW5kID09PSB0cy5TeW50YXhLaW5kLklkZW50aWZpZXJcbiAgICAgICYmIChpbm5lckVsZW1BY2MuZXhwcmVzc2lvbiBhcyB0cy5JZGVudGlmaWVyKS50ZXh0ID09PSBuYW1lXG4gICAgICAmJiBpbm5lckVsZW1BY2MuYXJndW1lbnRFeHByZXNzaW9uXG4gICAgICAmJiBpbm5lckVsZW1BY2MuYXJndW1lbnRFeHByZXNzaW9uLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuQmluYXJ5RXhwcmVzc2lvblxuICAgICkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IGlubmVyQXJnQmluRXhwciA9IGlubmVyRWxlbUFjYy5hcmd1bWVudEV4cHJlc3Npb24gYXMgdHMuQmluYXJ5RXhwcmVzc2lvbjtcblxuICAgIGlmIChpbm5lckFyZ0JpbkV4cHIubGVmdC5raW5kICE9PSB0cy5TeW50YXhLaW5kLkVsZW1lbnRBY2Nlc3NFeHByZXNzaW9uKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBpbm5lckFyZ0VsZW1BY2MgPSBpbm5lckFyZ0JpbkV4cHIubGVmdCBhcyB0cy5FbGVtZW50QWNjZXNzRXhwcmVzc2lvbjtcblxuICAgIGlmICghKFxuICAgICAgaW5uZXJBcmdFbGVtQWNjLmV4cHJlc3Npb24ua2luZCA9PT0gdHMuU3ludGF4S2luZC5JZGVudGlmaWVyXG4gICAgICAmJiAoaW5uZXJBcmdFbGVtQWNjLmV4cHJlc3Npb24gYXMgdHMuSWRlbnRpZmllcikudGV4dCA9PT0gbmFtZVxuICAgICkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBzdGF0ZW1lbnQuZXhwcmVzc2lvbjtcbn1cblxuLy8gVFMgMi4yIGVudW1zIGhhdmUgc3RhdGVtZW50cyBhZnRlciB0aGUgdmFyaWFibGUgZGVjbGFyYXRpb24sIHdpdGggaW5kZXggc3RhdGVtZW50cyBmb2xsb3dlZFxuLy8gYnkgdmFsdWUgc3RhdGVtZW50cy5cbmZ1bmN0aW9uIGZpbmRUczJfMkVudW1TdGF0ZW1lbnRzKFxuICBuYW1lOiBzdHJpbmcsXG4gIHN0YXRlbWVudHM6IHRzLk5vZGVBcnJheTx0cy5TdGF0ZW1lbnQ+LFxuICBzdGF0ZW1lbnRPZmZzZXQ6IG51bWJlcixcbik6IHRzLlN0YXRlbWVudFtdIHtcbiAgY29uc3QgZW51bVZhbHVlU3RhdGVtZW50czogdHMuU3RhdGVtZW50W10gPSBbXTtcbiAgY29uc3QgbWVtYmVyTmFtZXM6IHN0cmluZ1tdID0gW107XG5cbiAgbGV0IGluZGV4ID0gc3RhdGVtZW50T2Zmc2V0O1xuICBmb3IgKDsgaW5kZXggPCBzdGF0ZW1lbnRzLmxlbmd0aDsgKytpbmRleCkge1xuICAgIC8vIEVuc3VyZSBhbGwgc3RhdGVtZW50cyBhcmUgb2YgdGhlIGV4cGVjdGVkIGZvcm1hdCBhbmQgdXNpbmcgdGhlIHJpZ2h0IGlkZW50aWZlci5cbiAgICAvLyBXaGVuIHdlIGZpbmQgYSBzdGF0ZW1lbnQgdGhhdCBpc24ndCBwYXJ0IG9mIHRoZSBlbnVtLCByZXR1cm4gd2hhdCB3ZSBjb2xsZWN0ZWQgc28gZmFyLlxuICAgIGNvbnN0IGN1cnJlbnQgPSBzdGF0ZW1lbnRzW2luZGV4XTtcbiAgICBpZiAoIXRzLmlzRXhwcmVzc2lvblN0YXRlbWVudChjdXJyZW50KSB8fCAhdHMuaXNCaW5hcnlFeHByZXNzaW9uKGN1cnJlbnQuZXhwcmVzc2lvbikpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGNvbnN0IHByb3BlcnR5ID0gY3VycmVudC5leHByZXNzaW9uLmxlZnQ7XG4gICAgaWYgKCFwcm9wZXJ0eSB8fCAhdHMuaXNQcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24ocHJvcGVydHkpKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoIXRzLmlzSWRlbnRpZmllcihwcm9wZXJ0eS5leHByZXNzaW9uKSB8fCBwcm9wZXJ0eS5leHByZXNzaW9uLnRleHQgIT09IG5hbWUpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIG1lbWJlck5hbWVzLnB1c2gocHJvcGVydHkubmFtZS50ZXh0KTtcbiAgICBlbnVtVmFsdWVTdGF0ZW1lbnRzLnB1c2goY3VycmVudCk7XG4gIH1cblxuICBpZiAoZW51bVZhbHVlU3RhdGVtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICBjb25zdCBlbnVtTmFtZVN0YXRlbWVudHMgPSBmaW5kRW51bU5hbWVTdGF0ZW1lbnRzKG5hbWUsIHN0YXRlbWVudHMsIGluZGV4LCBtZW1iZXJOYW1lcyk7XG4gIGlmIChlbnVtTmFtZVN0YXRlbWVudHMubGVuZ3RoICE9PSBlbnVtVmFsdWVTdGF0ZW1lbnRzLmxlbmd0aCkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIHJldHVybiBlbnVtVmFsdWVTdGF0ZW1lbnRzLmNvbmNhdChlbnVtTmFtZVN0YXRlbWVudHMpO1xufVxuXG4vLyBUc2lja2xlIGVudW1zIGhhdmUgYSB2YXJpYWJsZSBzdGF0ZW1lbnQgd2l0aCBpbmRleGVzLCBmb2xsb3dlZCBieSB2YWx1ZSBzdGF0ZW1lbnRzLlxuLy8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hbmd1bGFyL2RldmtpdC9pc3N1ZXMvMjI5I2lzc3VlY29tbWVudC0zMzg1MTIwNTYgZm9yZSBtb3JlIGluZm9ybWF0aW9uLlxuZnVuY3Rpb24gZmluZEVudW1OYW1lU3RhdGVtZW50cyhcbiAgbmFtZTogc3RyaW5nLFxuICBzdGF0ZW1lbnRzOiB0cy5Ob2RlQXJyYXk8dHMuU3RhdGVtZW50PixcbiAgc3RhdGVtZW50T2Zmc2V0OiBudW1iZXIsXG4gIG1lbWJlck5hbWVzPzogc3RyaW5nW10sXG4pOiB0cy5TdGF0ZW1lbnRbXSB7XG4gIGNvbnN0IGVudW1TdGF0ZW1lbnRzOiB0cy5TdGF0ZW1lbnRbXSA9IFtdO1xuXG4gIGZvciAobGV0IGluZGV4ID0gc3RhdGVtZW50T2Zmc2V0OyBpbmRleCA8IHN0YXRlbWVudHMubGVuZ3RoOyArK2luZGV4KSB7XG4gICAgLy8gRW5zdXJlIGFsbCBzdGF0ZW1lbnRzIGFyZSBvZiB0aGUgZXhwZWN0ZWQgZm9ybWF0IGFuZCB1c2luZyB0aGUgcmlnaHQgaWRlbnRpZmVyLlxuICAgIC8vIFdoZW4gd2UgZmluZCBhIHN0YXRlbWVudCB0aGF0IGlzbid0IHBhcnQgb2YgdGhlIGVudW0sIHJldHVybiB3aGF0IHdlIGNvbGxlY3RlZCBzbyBmYXIuXG4gICAgY29uc3QgY3VycmVudCA9IHN0YXRlbWVudHNbaW5kZXhdO1xuICAgIGlmICghdHMuaXNFeHByZXNzaW9uU3RhdGVtZW50KGN1cnJlbnQpIHx8ICF0cy5pc0JpbmFyeUV4cHJlc3Npb24oY3VycmVudC5leHByZXNzaW9uKSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgY29uc3QgYWNjZXNzID0gY3VycmVudC5leHByZXNzaW9uLmxlZnQ7XG4gICAgY29uc3QgdmFsdWUgPSBjdXJyZW50LmV4cHJlc3Npb24ucmlnaHQ7XG4gICAgaWYgKCFhY2Nlc3MgfHwgIXRzLmlzRWxlbWVudEFjY2Vzc0V4cHJlc3Npb24oYWNjZXNzKSB8fCAhdmFsdWUgfHwgIXRzLmlzU3RyaW5nTGl0ZXJhbCh2YWx1ZSkpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGlmIChtZW1iZXJOYW1lcyAmJiAhbWVtYmVyTmFtZXMuaW5jbHVkZXModmFsdWUudGV4dCkpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGlmICghdHMuaXNJZGVudGlmaWVyKGFjY2Vzcy5leHByZXNzaW9uKSB8fCBhY2Nlc3MuZXhwcmVzc2lvbi50ZXh0ICE9PSBuYW1lKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoIWFjY2Vzcy5hcmd1bWVudEV4cHJlc3Npb24gfHwgIXRzLmlzUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKGFjY2Vzcy5hcmd1bWVudEV4cHJlc3Npb24pKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBjb25zdCBlbnVtRXhwcmVzc2lvbiA9IGFjY2Vzcy5hcmd1bWVudEV4cHJlc3Npb24uZXhwcmVzc2lvbjtcbiAgICBpZiAoIXRzLmlzSWRlbnRpZmllcihlbnVtRXhwcmVzc2lvbikgfHwgZW51bUV4cHJlc3Npb24udGV4dCAhPT0gbmFtZSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKHZhbHVlLnRleHQgIT09IGFjY2Vzcy5hcmd1bWVudEV4cHJlc3Npb24ubmFtZS50ZXh0KSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBlbnVtU3RhdGVtZW50cy5wdXNoKGN1cnJlbnQpO1xuICB9XG5cbiAgcmV0dXJuIGVudW1TdGF0ZW1lbnRzO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVIb3N0Tm9kZShob3N0Tm9kZTogdHMuVmFyaWFibGVTdGF0ZW1lbnQsIGV4cHJlc3Npb246IHRzLkV4cHJlc3Npb24pOiB0cy5TdGF0ZW1lbnQge1xuICBjb25zdCBwdXJlRnVuY3Rpb25Db21tZW50ID0gJ0BfX1BVUkVfXyc7XG5cbiAgLy8gVXBkYXRlIGV4aXN0aW5nIGhvc3Qgbm9kZSB3aXRoIHRoZSBwdXJlIGNvbW1lbnQgYmVmb3JlIHRoZSB2YXJpYWJsZSBkZWNsYXJhdGlvbiBpbml0aWFsaXplci5cbiAgY29uc3QgdmFyaWFibGVEZWNsYXJhdGlvbiA9IGhvc3ROb2RlLmRlY2xhcmF0aW9uTGlzdC5kZWNsYXJhdGlvbnNbMF07XG4gIGNvbnN0IG91dGVyVmFyU3RtdCA9IHRzLnVwZGF0ZVZhcmlhYmxlU3RhdGVtZW50KFxuICAgIGhvc3ROb2RlLFxuICAgIGhvc3ROb2RlLm1vZGlmaWVycyxcbiAgICB0cy51cGRhdGVWYXJpYWJsZURlY2xhcmF0aW9uTGlzdChcbiAgICAgIGhvc3ROb2RlLmRlY2xhcmF0aW9uTGlzdCxcbiAgICAgIFtcbiAgICAgICAgdHMudXBkYXRlVmFyaWFibGVEZWNsYXJhdGlvbihcbiAgICAgICAgICB2YXJpYWJsZURlY2xhcmF0aW9uLFxuICAgICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24ubmFtZSxcbiAgICAgICAgICB2YXJpYWJsZURlY2xhcmF0aW9uLnR5cGUsXG4gICAgICAgICAgdHMuYWRkU3ludGhldGljTGVhZGluZ0NvbW1lbnQoXG4gICAgICAgICAgICBleHByZXNzaW9uLFxuICAgICAgICAgICAgdHMuU3ludGF4S2luZC5NdWx0aUxpbmVDb21tZW50VHJpdmlhLFxuICAgICAgICAgICAgcHVyZUZ1bmN0aW9uQ29tbWVudCxcbiAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICksXG4gICAgICAgICksXG4gICAgICBdLFxuICAgICksXG4gICk7XG5cbiAgcmV0dXJuIG91dGVyVmFyU3RtdDtcbn1cblxuZnVuY3Rpb24gdXBkYXRlRW51bUlpZmUoaG9zdE5vZGU6IHRzLlZhcmlhYmxlU3RhdGVtZW50LCBpaWZlOiB0cy5DYWxsRXhwcmVzc2lvbik6IHRzLlN0YXRlbWVudCB7XG4gIGlmICghdHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihpaWZlLmV4cHJlc3Npb24pXG4gICAgICB8fCAhdHMuaXNGdW5jdGlvbkV4cHJlc3Npb24oaWlmZS5leHByZXNzaW9uLmV4cHJlc3Npb24pKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIElJRkUgU3RydWN0dXJlJyk7XG4gIH1cblxuICBjb25zdCBleHByZXNzaW9uID0gaWlmZS5leHByZXNzaW9uLmV4cHJlc3Npb247XG4gIGNvbnN0IHVwZGF0ZWRGdW5jdGlvbiA9IHRzLnVwZGF0ZUZ1bmN0aW9uRXhwcmVzc2lvbihcbiAgICBleHByZXNzaW9uLFxuICAgIGV4cHJlc3Npb24ubW9kaWZpZXJzLFxuICAgIGV4cHJlc3Npb24uYXN0ZXJpc2tUb2tlbixcbiAgICBleHByZXNzaW9uLm5hbWUsXG4gICAgZXhwcmVzc2lvbi50eXBlUGFyYW1ldGVycyxcbiAgICBleHByZXNzaW9uLnBhcmFtZXRlcnMsXG4gICAgZXhwcmVzc2lvbi50eXBlLFxuICAgIHRzLnVwZGF0ZUJsb2NrKFxuICAgICAgZXhwcmVzc2lvbi5ib2R5LFxuICAgICAgW1xuICAgICAgICAuLi5leHByZXNzaW9uLmJvZHkuc3RhdGVtZW50cyxcbiAgICAgICAgdHMuY3JlYXRlUmV0dXJuKGV4cHJlc3Npb24ucGFyYW1ldGVyc1swXS5uYW1lIGFzIHRzLklkZW50aWZpZXIpLFxuICAgICAgXSxcbiAgICApLFxuICApO1xuXG4gIGNvbnN0IHVwZGF0ZWRJaWZlID0gdHMudXBkYXRlQ2FsbChcbiAgICBpaWZlLFxuICAgIHRzLnVwZGF0ZVBhcmVuKFxuICAgICAgaWlmZS5leHByZXNzaW9uLFxuICAgICAgdXBkYXRlZEZ1bmN0aW9uLFxuICAgICksXG4gICAgaWlmZS50eXBlQXJndW1lbnRzLFxuICAgIFt0cy5jcmVhdGVPYmplY3RMaXRlcmFsKCldLFxuICApO1xuXG4gIHJldHVybiB1cGRhdGVIb3N0Tm9kZShob3N0Tm9kZSwgdXBkYXRlZElpZmUpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVXcmFwcGVkRW51bShcbiAgbmFtZTogc3RyaW5nLFxuICBob3N0Tm9kZTogdHMuVmFyaWFibGVTdGF0ZW1lbnQsXG4gIHN0YXRlbWVudHM6IEFycmF5PHRzLlN0YXRlbWVudD4sXG4gIGxpdGVyYWxJbml0aWFsaXplcjogdHMuT2JqZWN0TGl0ZXJhbEV4cHJlc3Npb24gfCB1bmRlZmluZWQsXG4pOiB0cy5TdGF0ZW1lbnQge1xuICBsaXRlcmFsSW5pdGlhbGl6ZXIgPSBsaXRlcmFsSW5pdGlhbGl6ZXIgfHwgdHMuY3JlYXRlT2JqZWN0TGl0ZXJhbCgpO1xuICBjb25zdCBpbm5lclZhclN0bXQgPSB0cy5jcmVhdGVWYXJpYWJsZVN0YXRlbWVudChcbiAgICB1bmRlZmluZWQsXG4gICAgdHMuY3JlYXRlVmFyaWFibGVEZWNsYXJhdGlvbkxpc3QoW1xuICAgICAgdHMuY3JlYXRlVmFyaWFibGVEZWNsYXJhdGlvbihuYW1lLCB1bmRlZmluZWQsIGxpdGVyYWxJbml0aWFsaXplciksXG4gICAgXSksXG4gICk7XG5cbiAgY29uc3QgaW5uZXJSZXR1cm4gPSB0cy5jcmVhdGVSZXR1cm4odHMuY3JlYXRlSWRlbnRpZmllcihuYW1lKSk7XG5cbiAgY29uc3QgaWlmZSA9IHRzLmNyZWF0ZUltbWVkaWF0ZWx5SW52b2tlZEZ1bmN0aW9uRXhwcmVzc2lvbihbXG4gICAgaW5uZXJWYXJTdG10LFxuICAgIC4uLnN0YXRlbWVudHMsXG4gICAgaW5uZXJSZXR1cm4sXG4gIF0pO1xuXG4gIHJldHVybiB1cGRhdGVIb3N0Tm9kZShob3N0Tm9kZSwgdHMuY3JlYXRlUGFyZW4oaWlmZSkpO1xufVxuIl19
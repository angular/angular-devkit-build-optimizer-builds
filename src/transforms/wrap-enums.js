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
exports.getWrapEnumsTransformer = void 0;
const ts = __importStar(require("typescript"));
const ast_utils_1 = require("../helpers/ast-utils");
function isBlockLike(node) {
    return (node.kind === ts.SyntaxKind.Block ||
        node.kind === ts.SyntaxKind.ModuleBlock ||
        node.kind === ts.SyntaxKind.CaseClause ||
        node.kind === ts.SyntaxKind.DefaultClause ||
        node.kind === ts.SyntaxKind.SourceFile);
}
function getWrapEnumsTransformer() {
    return (context) => {
        const transformer = (sf) => {
            const result = visitBlockStatements(sf.statements, context);
            return context.factory.updateSourceFile(sf, ts.setTextRange(result, sf.statements));
        };
        return transformer;
    };
}
exports.getWrapEnumsTransformer = getWrapEnumsTransformer;
function visitBlockStatements(statements, context) {
    // copy of statements to modify; lazy initialized
    let updatedStatements;
    const nodeFactory = context.factory;
    const visitor = (node) => {
        if (isBlockLike(node)) {
            let result = visitBlockStatements(node.statements, context);
            if (result === node.statements) {
                return node;
            }
            result = ts.setTextRange(result, node.statements);
            switch (node.kind) {
                case ts.SyntaxKind.Block:
                    return nodeFactory.updateBlock(node, result);
                case ts.SyntaxKind.ModuleBlock:
                    return nodeFactory.updateModuleBlock(node, result);
                case ts.SyntaxKind.CaseClause:
                    return nodeFactory.updateCaseClause(node, node.expression, result);
                case ts.SyntaxKind.DefaultClause:
                    return nodeFactory.updateDefaultClause(node, result);
                default:
                    return node;
            }
        }
        else {
            return node;
        }
    };
    // 'oIndex' is the original statement index; 'uIndex' is the updated statement index
    for (let oIndex = 0, uIndex = 0; oIndex < statements.length - 1; oIndex++, uIndex++) {
        const currentStatement = statements[oIndex];
        let newStatement;
        let oldStatementsLength = 0;
        // these can't contain an enum declaration
        if (currentStatement.kind === ts.SyntaxKind.ImportDeclaration) {
            continue;
        }
        // enum declarations must:
        //   * not be last statement
        //   * be a variable statement
        //   * have only one declaration
        //   * have an identifer as a declaration name
        // ClassExpression declarations must:
        //   * not be last statement
        //   * be a variable statement
        //   * have only one declaration
        //   * have an ClassExpression or BinaryExpression and a right
        //     of kind ClassExpression as a initializer
        if (ts.isVariableStatement(currentStatement) &&
            currentStatement.declarationList.declarations.length === 1) {
            const variableDeclaration = currentStatement.declarationList.declarations[0];
            const initializer = variableDeclaration.initializer;
            if (ts.isIdentifier(variableDeclaration.name)) {
                const name = variableDeclaration.name.text;
                if (!initializer) {
                    const iife = findEnumIife(name, statements[oIndex + 1]);
                    if (iife) {
                        // update IIFE and replace variable statement and old IIFE
                        oldStatementsLength = 2;
                        newStatement = updateEnumIife(nodeFactory, currentStatement, iife[0], iife[1]);
                        // skip IIFE statement
                        oIndex++;
                    }
                }
                else if (ts.isClassExpression(initializer) ||
                    (ts.isBinaryExpression(initializer) && ts.isClassExpression(initializer.right))) {
                    const classStatements = findStatements(name, statements, oIndex);
                    if (!classStatements) {
                        continue;
                    }
                    oldStatementsLength = classStatements.length;
                    newStatement = createWrappedClass(nodeFactory, variableDeclaration, classStatements);
                    oIndex += classStatements.length - 1;
                }
            }
        }
        else if (ts.isClassDeclaration(currentStatement)) {
            const name = currentStatement.name.text;
            const classStatements = findStatements(name, statements, oIndex);
            if (!classStatements) {
                continue;
            }
            oldStatementsLength = classStatements.length;
            newStatement = createWrappedClass(nodeFactory, currentStatement, classStatements);
            oIndex += oldStatementsLength - 1;
        }
        if (newStatement && newStatement.length > 0) {
            if (!updatedStatements) {
                updatedStatements = [...statements];
            }
            updatedStatements.splice(uIndex, oldStatementsLength, ...newStatement);
            // When having more than a single new statement
            // we need to update the update Index
            uIndex += newStatement ? newStatement.length - 1 : 0;
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
    return updatedStatements ? nodeFactory.createNodeArray(updatedStatements) : statements;
}
// TS 2.3 enums have statements that are inside a IIFE.
function findEnumIife(name, statement) {
    if (!ts.isExpressionStatement(statement)) {
        return null;
    }
    const expression = statement.expression;
    if (!expression || !ts.isCallExpression(expression) || expression.arguments.length !== 1) {
        return null;
    }
    const callExpression = expression;
    let exportExpression;
    if (!ts.isParenthesizedExpression(callExpression.expression)) {
        return null;
    }
    const functionExpression = callExpression.expression.expression;
    if (!ts.isFunctionExpression(functionExpression)) {
        return null;
    }
    // The name of the parameter can be different than the name of the enum if it was renamed
    // due to scope hoisting.
    const parameter = functionExpression.parameters[0];
    if (!ts.isIdentifier(parameter.name)) {
        return null;
    }
    const parameterName = parameter.name.text;
    let argument = callExpression.arguments[0];
    if (!ts.isBinaryExpression(argument) ||
        !ts.isIdentifier(argument.left) ||
        argument.left.text !== name) {
        return null;
    }
    let potentialExport = false;
    if (argument.operatorToken.kind === ts.SyntaxKind.FirstAssignment) {
        if (ts.isBinaryExpression(argument.right) &&
            argument.right.operatorToken.kind !== ts.SyntaxKind.BarBarToken) {
            return null;
        }
        potentialExport = true;
        argument = argument.right;
    }
    if (!ts.isBinaryExpression(argument)) {
        return null;
    }
    if (argument.operatorToken.kind !== ts.SyntaxKind.BarBarToken) {
        return null;
    }
    if (potentialExport && !ts.isIdentifier(argument.left)) {
        exportExpression = argument.left;
    }
    // Go through all the statements and check that all match the name
    for (const statement of functionExpression.body.statements) {
        if (!ts.isExpressionStatement(statement) ||
            !ts.isBinaryExpression(statement.expression) ||
            !ts.isElementAccessExpression(statement.expression.left)) {
            return null;
        }
        const leftExpression = statement.expression.left.expression;
        if (!ts.isIdentifier(leftExpression) || leftExpression.text !== parameterName) {
            return null;
        }
    }
    return [callExpression, exportExpression];
}
function updateHostNode(nodeFactory, hostNode, expression) {
    // Update existing host node with the pure comment before the variable declaration initializer.
    const variableDeclaration = hostNode.declarationList.declarations[0];
    const outerVarStmt = nodeFactory.updateVariableStatement(hostNode, hostNode.modifiers, nodeFactory.updateVariableDeclarationList(hostNode.declarationList, [
        nodeFactory.updateVariableDeclaration(variableDeclaration, variableDeclaration.name, variableDeclaration.exclamationToken, variableDeclaration.type, expression),
    ]));
    return outerVarStmt;
}
/**
 * Find enums, class expression or declaration statements.
 *
 * The classExpressions block to wrap in an iife must
 * - end with an ExpressionStatement
 * - it's expression must be a BinaryExpression
 * - have the same name
 *
 * ```
 let Foo = class Foo {};
 Foo = __decorate([]);
 ```
 */
function findStatements(name, statements, statementIndex, offset = 0) {
    let count = 1;
    for (let index = statementIndex + 1; index < statements.length; ++index) {
        const statement = statements[index];
        if (!ts.isExpressionStatement(statement)) {
            break;
        }
        const expression = statement.expression;
        if (ts.isCallExpression(expression)) {
            // Ex:
            // setClassMetadata(FooClass, [{}], void 0);
            // __decorate([propDecorator()], FooClass.prototype, "propertyName", void 0);
            // __decorate([propDecorator()], FooClass, "propertyName", void 0);
            // __decorate$1([propDecorator()], FooClass, "propertyName", void 0);
            const args = expression.arguments;
            if (args.length > 2) {
                const isReferenced = args.some((arg) => {
                    const potentialIdentifier = ts.isPropertyAccessExpression(arg) ? arg.expression : arg;
                    return ts.isIdentifier(potentialIdentifier) && potentialIdentifier.text === name;
                });
                if (isReferenced) {
                    count++;
                    continue;
                }
            }
        }
        else if (ts.isBinaryExpression(expression)) {
            const node = ts.isBinaryExpression(expression.left) ? expression.left.left : expression.left;
            const leftExpression = ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
                ? // Static Properties // Ex: Foo.bar = 'value';
                    // ENUM Property // Ex:  ChangeDetectionStrategy[ChangeDetectionStrategy.Default] = "Default";
                    node.expression
                : // Ex: FooClass = __decorate([Component()], FooClass);
                    node;
            if (ts.isIdentifier(leftExpression) && leftExpression.text === name) {
                count++;
                continue;
            }
        }
        break;
    }
    if (count > 1) {
        return statements.slice(statementIndex + offset, statementIndex + count);
    }
    return undefined;
}
function updateEnumIife(nodeFactory, hostNode, iife, exportAssignment) {
    if (!ts.isParenthesizedExpression(iife.expression) ||
        !ts.isFunctionExpression(iife.expression.expression)) {
        throw new Error('Invalid IIFE Structure');
    }
    // Ignore export assignment if variable is directly exported
    if (hostNode.modifiers &&
        hostNode.modifiers.findIndex((m) => m.kind == ts.SyntaxKind.ExportKeyword) != -1) {
        exportAssignment = undefined;
    }
    const expression = iife.expression.expression;
    const updatedFunction = nodeFactory.updateFunctionExpression(expression, expression.modifiers, expression.asteriskToken, expression.name, expression.typeParameters, expression.parameters, expression.type, nodeFactory.updateBlock(expression.body, [
        ...expression.body.statements,
        nodeFactory.createReturnStatement(expression.parameters[0].name),
    ]));
    let arg = nodeFactory.createObjectLiteralExpression();
    if (exportAssignment) {
        arg = nodeFactory.createBinaryExpression(exportAssignment, ts.SyntaxKind.BarBarToken, arg);
    }
    const updatedIife = nodeFactory.updateCallExpression(iife, nodeFactory.updateParenthesizedExpression(iife.expression, updatedFunction), iife.typeArguments, [arg]);
    let value = (0, ast_utils_1.addPureComment)(updatedIife);
    if (exportAssignment) {
        value = nodeFactory.createBinaryExpression(exportAssignment, ts.SyntaxKind.FirstAssignment, updatedIife);
    }
    return [updateHostNode(nodeFactory, hostNode, value)];
}
function createWrappedClass(nodeFactory, hostNode, statements) {
    const name = hostNode.name.text;
    const updatedStatements = [...statements];
    if (ts.isClassDeclaration(hostNode)) {
        updatedStatements[0] = nodeFactory.createClassDeclaration(hostNode.decorators, undefined, hostNode.name, hostNode.typeParameters, hostNode.heritageClauses, hostNode.members);
    }
    const pureIife = (0, ast_utils_1.addPureComment)(nodeFactory.createImmediatelyInvokedArrowFunction([
        ...updatedStatements,
        nodeFactory.createReturnStatement(nodeFactory.createIdentifier(name)),
    ]));
    const modifiers = hostNode.modifiers;
    const isDefault = !!modifiers && modifiers.some((x) => x.kind === ts.SyntaxKind.DefaultKeyword);
    const newStatement = [];
    newStatement.push(nodeFactory.createVariableStatement(isDefault ? undefined : modifiers, nodeFactory.createVariableDeclarationList([nodeFactory.createVariableDeclaration(name, undefined, undefined, pureIife)], ts.NodeFlags.Let)));
    if (isDefault) {
        newStatement.push(nodeFactory.createExportAssignment(undefined, undefined, false, nodeFactory.createIdentifier(name)));
    }
    return newStatement;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid3JhcC1lbnVtcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2J1aWxkX29wdGltaXplci9zcmMvdHJhbnNmb3Jtcy93cmFwLWVudW1zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsK0NBQWlDO0FBQ2pDLG9EQUFzRDtBQUV0RCxTQUFTLFdBQVcsQ0FBQyxJQUFhO0lBQ2hDLE9BQU8sQ0FDTCxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsS0FBSztRQUNqQyxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsV0FBVztRQUN2QyxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsVUFBVTtRQUN0QyxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYTtRQUN6QyxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUN2QyxDQUFDO0FBQ0osQ0FBQztBQUVELFNBQWdCLHVCQUF1QjtJQUNyQyxPQUFPLENBQUMsT0FBaUMsRUFBaUMsRUFBRTtRQUMxRSxNQUFNLFdBQVcsR0FBa0MsQ0FBQyxFQUFFLEVBQUUsRUFBRTtZQUN4RCxNQUFNLE1BQU0sR0FBRyxvQkFBb0IsQ0FBQyxFQUFFLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBRTVELE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDdEYsQ0FBQyxDQUFDO1FBRUYsT0FBTyxXQUFXLENBQUM7SUFDckIsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQVZE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QUFDLDZCQUE2QixDQUN2QyxDQUFDLFdBQVcsQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxRQUFRLENBQUMsQ0FBQyxFQUM3RSxFQUFFLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FDakIsQ0FDRixDQUNGLENBQUM7SUFFRixJQUFJLFNBQVMsRUFBRTtRQUNiLFlBQVksQ0FBQyxJQUFJLENBQ2YsV0FBVyxDQUFDLHNCQUFzQixDQUNoQyxTQUFTLEVBQ1QsU0FBUyxFQUNULEtBQUssRUFDTCxXQUFXLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQ25DLENBQ0YsQ0FBQztLQUNIO0lBRUQsT0FBTyxZQUFZLENBQUM7QUFDdEIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgKiBhcyB0cyBmcm9tICd0eXBlc2NyaXB0JztcbmltcG9ydCB7IGFkZFB1cmVDb21tZW50IH0gZnJvbSAnLi4vaGVscGVycy9hc3QtdXRpbHMnO1xuXG5mdW5jdGlvbiBpc0Jsb2NrTGlrZShub2RlOiB0cy5Ob2RlKTogbm9kZSBpcyB0cy5CbG9ja0xpa2Uge1xuICByZXR1cm4gKFxuICAgIG5vZGUua2luZCA9PT0gdHMuU3ludGF4S2luZC5CbG9jayB8fFxuICAgIG5vZGUua2luZCA9PT0gdHMuU3ludGF4S2luZC5Nb2R1bGVCbG9jayB8fFxuICAgIG5vZGUua2luZCA9PT0gdHMuU3ludGF4S2luZC5DYXNlQ2xhdXNlIHx8XG4gICAgbm9kZS5raW5kID09PSB0cy5TeW50YXhLaW5kLkRlZmF1bHRDbGF1c2UgfHxcbiAgICBub2RlLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuU291cmNlRmlsZVxuICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0V3JhcEVudW1zVHJhbnNmb3JtZXIoKTogdHMuVHJhbnNmb3JtZXJGYWN0b3J5PHRzLlNvdXJjZUZpbGU+IHtcbiAgcmV0dXJuIChjb250ZXh0OiB0cy5UcmFuc2Zvcm1hdGlvbkNvbnRleHQpOiB0cy5UcmFuc2Zvcm1lcjx0cy5Tb3VyY2VGaWxlPiA9PiB7XG4gICAgY29uc3QgdHJhbnNmb3JtZXI6IHRzLlRyYW5zZm9ybWVyPHRzLlNvdXJjZUZpbGU+ID0gKHNmKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSB2aXNpdEJsb2NrU3RhdGVtZW50cyhzZi5zdGF0ZW1lbnRzLCBjb250ZXh0KTtcblxuICAgICAgcmV0dXJuIGNvbnRleHQuZmFjdG9yeS51cGRhdGVTb3VyY2VGaWxlKHNmLCB0cy5zZXRUZXh0UmFuZ2UocmVzdWx0LCBzZi5zdGF0ZW1lbnRzKSk7XG4gICAgfTtcblxuICAgIHJldHVybiB0cmFuc2Zvcm1lcjtcbiAgfTtcbn1cblxuZnVuY3Rpb24gdmlzaXRCbG9ja1N0YXRlbWVudHMoXG4gIHN0YXRlbWVudHM6IHRzLk5vZGVBcnJheTx0cy5TdGF0ZW1lbnQ+LFxuICBjb250ZXh0OiB0cy5UcmFuc2Zvcm1hdGlvbkNvbnRleHQsXG4pOiB0cy5Ob2RlQXJyYXk8dHMuU3RhdGVtZW50PiB7XG4gIC8vIGNvcHkgb2Ygc3RhdGVtZW50cyB0byBtb2RpZnk7IGxhenkgaW5pdGlhbGl6ZWRcbiAgbGV0IHVwZGF0ZWRTdGF0ZW1lbnRzOiBBcnJheTx0cy5TdGF0ZW1lbnQ+IHwgdW5kZWZpbmVkO1xuICBjb25zdCBub2RlRmFjdG9yeSA9IGNvbnRleHQuZmFjdG9yeTtcblxuICBjb25zdCB2aXNpdG9yOiB0cy5WaXNpdG9yID0gKG5vZGUpID0+IHtcbiAgICBpZiAoaXNCbG9ja0xpa2Uobm9kZSkpIHtcbiAgICAgIGxldCByZXN1bHQgPSB2aXNpdEJsb2NrU3RhdGVtZW50cyhub2RlLnN0YXRlbWVudHMsIGNvbnRleHQpO1xuICAgICAgaWYgKHJlc3VsdCA9PT0gbm9kZS5zdGF0ZW1lbnRzKSB7XG4gICAgICAgIHJldHVybiBub2RlO1xuICAgICAgfVxuICAgICAgcmVzdWx0ID0gdHMuc2V0VGV4dFJhbmdlKHJlc3VsdCwgbm9kZS5zdGF0ZW1lbnRzKTtcbiAgICAgIHN3aXRjaCAobm9kZS5raW5kKSB7XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5CbG9jazpcbiAgICAgICAgICByZXR1cm4gbm9kZUZhY3RvcnkudXBkYXRlQmxvY2sobm9kZSwgcmVzdWx0KTtcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLk1vZHVsZUJsb2NrOlxuICAgICAgICAgIHJldHVybiBub2RlRmFjdG9yeS51cGRhdGVNb2R1bGVCbG9jayhub2RlLCByZXN1bHQpO1xuICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuQ2FzZUNsYXVzZTpcbiAgICAgICAgICByZXR1cm4gbm9kZUZhY3RvcnkudXBkYXRlQ2FzZUNsYXVzZShub2RlLCBub2RlLmV4cHJlc3Npb24sIHJlc3VsdCk7XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5EZWZhdWx0Q2xhdXNlOlxuICAgICAgICAgIHJldHVybiBub2RlRmFjdG9yeS51cGRhdGVEZWZhdWx0Q2xhdXNlKG5vZGUsIHJlc3VsdCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgcmV0dXJuIG5vZGU7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBub2RlO1xuICAgIH1cbiAgfTtcblxuICAvLyAnb0luZGV4JyBpcyB0aGUgb3JpZ2luYWwgc3RhdGVtZW50IGluZGV4OyAndUluZGV4JyBpcyB0aGUgdXBkYXRlZCBzdGF0ZW1lbnQgaW5kZXhcbiAgZm9yIChsZXQgb0luZGV4ID0gMCwgdUluZGV4ID0gMDsgb0luZGV4IDwgc3RhdGVtZW50cy5sZW5ndGggLSAxOyBvSW5kZXgrKywgdUluZGV4KyspIHtcbiAgICBjb25zdCBjdXJyZW50U3RhdGVtZW50ID0gc3RhdGVtZW50c1tvSW5kZXhdO1xuICAgIGxldCBuZXdTdGF0ZW1lbnQ6IHRzLlN0YXRlbWVudFtdIHwgdW5kZWZpbmVkO1xuICAgIGxldCBvbGRTdGF0ZW1lbnRzTGVuZ3RoID0gMDtcblxuICAgIC8vIHRoZXNlIGNhbid0IGNvbnRhaW4gYW4gZW51bSBkZWNsYXJhdGlvblxuICAgIGlmIChjdXJyZW50U3RhdGVtZW50LmtpbmQgPT09IHRzLlN5bnRheEtpbmQuSW1wb3J0RGVjbGFyYXRpb24pIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIGVudW0gZGVjbGFyYXRpb25zIG11c3Q6XG4gICAgLy8gICAqIG5vdCBiZSBsYXN0IHN0YXRlbWVudFxuICAgIC8vICAgKiBiZSBhIHZhcmlhYmxlIHN0YXRlbWVudFxuICAgIC8vICAgKiBoYXZlIG9ubHkgb25lIGRlY2xhcmF0aW9uXG4gICAgLy8gICAqIGhhdmUgYW4gaWRlbnRpZmVyIGFzIGEgZGVjbGFyYXRpb24gbmFtZVxuXG4gICAgLy8gQ2xhc3NFeHByZXNzaW9uIGRlY2xhcmF0aW9ucyBtdXN0OlxuICAgIC8vICAgKiBub3QgYmUgbGFzdCBzdGF0ZW1lbnRcbiAgICAvLyAgICogYmUgYSB2YXJpYWJsZSBzdGF0ZW1lbnRcbiAgICAvLyAgICogaGF2ZSBvbmx5IG9uZSBkZWNsYXJhdGlvblxuICAgIC8vICAgKiBoYXZlIGFuIENsYXNzRXhwcmVzc2lvbiBvciBCaW5hcnlFeHByZXNzaW9uIGFuZCBhIHJpZ2h0XG4gICAgLy8gICAgIG9mIGtpbmQgQ2xhc3NFeHByZXNzaW9uIGFzIGEgaW5pdGlhbGl6ZXJcbiAgICBpZiAoXG4gICAgICB0cy5pc1ZhcmlhYmxlU3RhdGVtZW50KGN1cnJlbnRTdGF0ZW1lbnQpICYmXG4gICAgICBjdXJyZW50U3RhdGVtZW50LmRlY2xhcmF0aW9uTGlzdC5kZWNsYXJhdGlvbnMubGVuZ3RoID09PSAxXG4gICAgKSB7XG4gICAgICBjb25zdCB2YXJpYWJsZURlY2xhcmF0aW9uID0gY3VycmVudFN0YXRlbWVudC5kZWNsYXJhdGlvbkxpc3QuZGVjbGFyYXRpb25zWzBdO1xuICAgICAgY29uc3QgaW5pdGlhbGl6ZXIgPSB2YXJpYWJsZURlY2xhcmF0aW9uLmluaXRpYWxpemVyO1xuICAgICAgaWYgKHRzLmlzSWRlbnRpZmllcih2YXJpYWJsZURlY2xhcmF0aW9uLm5hbWUpKSB7XG4gICAgICAgIGNvbnN0IG5hbWUgPSB2YXJpYWJsZURlY2xhcmF0aW9uLm5hbWUudGV4dDtcblxuICAgICAgICBpZiAoIWluaXRpYWxpemVyKSB7XG4gICAgICAgICAgY29uc3QgaWlmZSA9IGZpbmRFbnVtSWlmZShuYW1lLCBzdGF0ZW1lbnRzW29JbmRleCArIDFdKTtcbiAgICAgICAgICBpZiAoaWlmZSkge1xuICAgICAgICAgICAgLy8gdXBkYXRlIElJRkUgYW5kIHJlcGxhY2UgdmFyaWFibGUgc3RhdGVtZW50IGFuZCBvbGQgSUlGRVxuICAgICAgICAgICAgb2xkU3RhdGVtZW50c0xlbmd0aCA9IDI7XG4gICAgICAgICAgICBuZXdTdGF0ZW1lbnQgPSB1cGRhdGVFbnVtSWlmZShub2RlRmFjdG9yeSwgY3VycmVudFN0YXRlbWVudCwgaWlmZVswXSwgaWlmZVsxXSk7XG4gICAgICAgICAgICAvLyBza2lwIElJRkUgc3RhdGVtZW50XG4gICAgICAgICAgICBvSW5kZXgrKztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgdHMuaXNDbGFzc0V4cHJlc3Npb24oaW5pdGlhbGl6ZXIpIHx8XG4gICAgICAgICAgKHRzLmlzQmluYXJ5RXhwcmVzc2lvbihpbml0aWFsaXplcikgJiYgdHMuaXNDbGFzc0V4cHJlc3Npb24oaW5pdGlhbGl6ZXIucmlnaHQpKVxuICAgICAgICApIHtcbiAgICAgICAgICBjb25zdCBjbGFzc1N0YXRlbWVudHMgPSBmaW5kU3RhdGVtZW50cyhuYW1lLCBzdGF0ZW1lbnRzLCBvSW5kZXgpO1xuICAgICAgICAgIGlmICghY2xhc3NTdGF0ZW1lbnRzKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBvbGRTdGF0ZW1lbnRzTGVuZ3RoID0gY2xhc3NTdGF0ZW1lbnRzLmxlbmd0aDtcbiAgICAgICAgICBuZXdTdGF0ZW1lbnQgPSBjcmVhdGVXcmFwcGVkQ2xhc3Mobm9kZUZhY3RvcnksIHZhcmlhYmxlRGVjbGFyYXRpb24sIGNsYXNzU3RhdGVtZW50cyk7XG5cbiAgICAgICAgICBvSW5kZXggKz0gY2xhc3NTdGF0ZW1lbnRzLmxlbmd0aCAtIDE7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHRzLmlzQ2xhc3NEZWNsYXJhdGlvbihjdXJyZW50U3RhdGVtZW50KSkge1xuICAgICAgY29uc3QgbmFtZSA9IChjdXJyZW50U3RhdGVtZW50Lm5hbWUgYXMgdHMuSWRlbnRpZmllcikudGV4dDtcbiAgICAgIGNvbnN0IGNsYXNzU3RhdGVtZW50cyA9IGZpbmRTdGF0ZW1lbnRzKG5hbWUsIHN0YXRlbWVudHMsIG9JbmRleCk7XG4gICAgICBpZiAoIWNsYXNzU3RhdGVtZW50cykge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgb2xkU3RhdGVtZW50c0xlbmd0aCA9IGNsYXNzU3RhdGVtZW50cy5sZW5ndGg7XG4gICAgICBuZXdTdGF0ZW1lbnQgPSBjcmVhdGVXcmFwcGVkQ2xhc3Mobm9kZUZhY3RvcnksIGN1cnJlbnRTdGF0ZW1lbnQsIGNsYXNzU3RhdGVtZW50cyk7XG5cbiAgICAgIG9JbmRleCArPSBvbGRTdGF0ZW1lbnRzTGVuZ3RoIC0gMTtcbiAgICB9XG5cbiAgICBpZiAobmV3U3RhdGVtZW50ICYmIG5ld1N0YXRlbWVudC5sZW5ndGggPiAwKSB7XG4gICAgICBpZiAoIXVwZGF0ZWRTdGF0ZW1lbnRzKSB7XG4gICAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzID0gWy4uLnN0YXRlbWVudHNdO1xuICAgICAgfVxuXG4gICAgICB1cGRhdGVkU3RhdGVtZW50cy5zcGxpY2UodUluZGV4LCBvbGRTdGF0ZW1lbnRzTGVuZ3RoLCAuLi5uZXdTdGF0ZW1lbnQpO1xuICAgICAgLy8gV2hlbiBoYXZpbmcgbW9yZSB0aGFuIGEgc2luZ2xlIG5ldyBzdGF0ZW1lbnRcbiAgICAgIC8vIHdlIG5lZWQgdG8gdXBkYXRlIHRoZSB1cGRhdGUgSW5kZXhcbiAgICAgIHVJbmRleCArPSBuZXdTdGF0ZW1lbnQgPyBuZXdTdGF0ZW1lbnQubGVuZ3RoIC0gMSA6IDA7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0gdHMudmlzaXROb2RlKGN1cnJlbnRTdGF0ZW1lbnQsIHZpc2l0b3IpO1xuICAgIGlmIChyZXN1bHQgIT09IGN1cnJlbnRTdGF0ZW1lbnQpIHtcbiAgICAgIGlmICghdXBkYXRlZFN0YXRlbWVudHMpIHtcbiAgICAgICAgdXBkYXRlZFN0YXRlbWVudHMgPSBzdGF0ZW1lbnRzLnNsaWNlKCk7XG4gICAgICB9XG4gICAgICB1cGRhdGVkU3RhdGVtZW50c1t1SW5kZXhdID0gcmVzdWx0O1xuICAgIH1cbiAgfVxuXG4gIC8vIGlmIGNoYW5nZXMsIHJldHVybiB1cGRhdGVkIHN0YXRlbWVudHNcbiAgLy8gb3RoZXJ3aXNlLCByZXR1cm4gb3JpZ2luYWwgYXJyYXkgaW5zdGFuY2VcbiAgcmV0dXJuIHVwZGF0ZWRTdGF0ZW1lbnRzID8gbm9kZUZhY3RvcnkuY3JlYXRlTm9kZUFycmF5KHVwZGF0ZWRTdGF0ZW1lbnRzKSA6IHN0YXRlbWVudHM7XG59XG5cbi8vIFRTIDIuMyBlbnVtcyBoYXZlIHN0YXRlbWVudHMgdGhhdCBhcmUgaW5zaWRlIGEgSUlGRS5cbmZ1bmN0aW9uIGZpbmRFbnVtSWlmZShcbiAgbmFtZTogc3RyaW5nLFxuICBzdGF0ZW1lbnQ6IHRzLlN0YXRlbWVudCxcbik6IFt0cy5DYWxsRXhwcmVzc2lvbiwgdHMuRXhwcmVzc2lvbiB8IHVuZGVmaW5lZF0gfCBudWxsIHtcbiAgaWYgKCF0cy5pc0V4cHJlc3Npb25TdGF0ZW1lbnQoc3RhdGVtZW50KSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgZXhwcmVzc2lvbiA9IHN0YXRlbWVudC5leHByZXNzaW9uO1xuICBpZiAoIWV4cHJlc3Npb24gfHwgIXRzLmlzQ2FsbEV4cHJlc3Npb24oZXhwcmVzc2lvbikgfHwgZXhwcmVzc2lvbi5hcmd1bWVudHMubGVuZ3RoICE9PSAxKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBjYWxsRXhwcmVzc2lvbiA9IGV4cHJlc3Npb247XG4gIGxldCBleHBvcnRFeHByZXNzaW9uOiB0cy5FeHByZXNzaW9uIHwgdW5kZWZpbmVkO1xuXG4gIGlmICghdHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihjYWxsRXhwcmVzc2lvbi5leHByZXNzaW9uKSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgZnVuY3Rpb25FeHByZXNzaW9uID0gY2FsbEV4cHJlc3Npb24uZXhwcmVzc2lvbi5leHByZXNzaW9uO1xuICBpZiAoIXRzLmlzRnVuY3Rpb25FeHByZXNzaW9uKGZ1bmN0aW9uRXhwcmVzc2lvbikpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIC8vIFRoZSBuYW1lIG9mIHRoZSBwYXJhbWV0ZXIgY2FuIGJlIGRpZmZlcmVudCB0aGFuIHRoZSBuYW1lIG9mIHRoZSBlbnVtIGlmIGl0IHdhcyByZW5hbWVkXG4gIC8vIGR1ZSB0byBzY29wZSBob2lzdGluZy5cbiAgY29uc3QgcGFyYW1ldGVyID0gZnVuY3Rpb25FeHByZXNzaW9uLnBhcmFtZXRlcnNbMF07XG4gIGlmICghdHMuaXNJZGVudGlmaWVyKHBhcmFtZXRlci5uYW1lKSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGNvbnN0IHBhcmFtZXRlck5hbWUgPSBwYXJhbWV0ZXIubmFtZS50ZXh0O1xuXG4gIGxldCBhcmd1bWVudCA9IGNhbGxFeHByZXNzaW9uLmFyZ3VtZW50c1swXTtcbiAgaWYgKFxuICAgICF0cy5pc0JpbmFyeUV4cHJlc3Npb24oYXJndW1lbnQpIHx8XG4gICAgIXRzLmlzSWRlbnRpZmllcihhcmd1bWVudC5sZWZ0KSB8fFxuICAgIGFyZ3VtZW50LmxlZnQudGV4dCAhPT0gbmFtZVxuICApIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGxldCBwb3RlbnRpYWxFeHBvcnQgPSBmYWxzZTtcbiAgaWYgKGFyZ3VtZW50Lm9wZXJhdG9yVG9rZW4ua2luZCA9PT0gdHMuU3ludGF4S2luZC5GaXJzdEFzc2lnbm1lbnQpIHtcbiAgICBpZiAoXG4gICAgICB0cy5pc0JpbmFyeUV4cHJlc3Npb24oYXJndW1lbnQucmlnaHQpICYmXG4gICAgICBhcmd1bWVudC5yaWdodC5vcGVyYXRvclRva2VuLmtpbmQgIT09IHRzLlN5bnRheEtpbmQuQmFyQmFyVG9rZW5cbiAgICApIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHBvdGVudGlhbEV4cG9ydCA9IHRydWU7XG4gICAgYXJndW1lbnQgPSBhcmd1bWVudC5yaWdodDtcbiAgfVxuXG4gIGlmICghdHMuaXNCaW5hcnlFeHByZXNzaW9uKGFyZ3VtZW50KSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgaWYgKGFyZ3VtZW50Lm9wZXJhdG9yVG9rZW4ua2luZCAhPT0gdHMuU3ludGF4S2luZC5CYXJCYXJUb2tlbikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgaWYgKHBvdGVudGlhbEV4cG9ydCAmJiAhdHMuaXNJZGVudGlmaWVyKGFyZ3VtZW50LmxlZnQpKSB7XG4gICAgZXhwb3J0RXhwcmVzc2lvbiA9IGFyZ3VtZW50LmxlZnQ7XG4gIH1cblxuICAvLyBHbyB0aHJvdWdoIGFsbCB0aGUgc3RhdGVtZW50cyBhbmQgY2hlY2sgdGhhdCBhbGwgbWF0Y2ggdGhlIG5hbWVcbiAgZm9yIChjb25zdCBzdGF0ZW1lbnQgb2YgZnVuY3Rpb25FeHByZXNzaW9uLmJvZHkuc3RhdGVtZW50cykge1xuICAgIGlmIChcbiAgICAgICF0cy5pc0V4cHJlc3Npb25TdGF0ZW1lbnQoc3RhdGVtZW50KSB8fFxuICAgICAgIXRzLmlzQmluYXJ5RXhwcmVzc2lvbihzdGF0ZW1lbnQuZXhwcmVzc2lvbikgfHxcbiAgICAgICF0cy5pc0VsZW1lbnRBY2Nlc3NFeHByZXNzaW9uKHN0YXRlbWVudC5leHByZXNzaW9uLmxlZnQpXG4gICAgKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBsZWZ0RXhwcmVzc2lvbiA9IHN0YXRlbWVudC5leHByZXNzaW9uLmxlZnQuZXhwcmVzc2lvbjtcbiAgICBpZiAoIXRzLmlzSWRlbnRpZmllcihsZWZ0RXhwcmVzc2lvbikgfHwgbGVmdEV4cHJlc3Npb24udGV4dCAhPT0gcGFyYW1ldGVyTmFtZSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIFtjYWxsRXhwcmVzc2lvbiwgZXhwb3J0RXhwcmVzc2lvbl07XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUhvc3ROb2RlKFxuICBub2RlRmFjdG9yeTogdHMuTm9kZUZhY3RvcnksXG4gIGhvc3ROb2RlOiB0cy5WYXJpYWJsZVN0YXRlbWVudCxcbiAgZXhwcmVzc2lvbjogdHMuRXhwcmVzc2lvbixcbik6IHRzLlN0YXRlbWVudCB7XG4gIC8vIFVwZGF0ZSBleGlzdGluZyBob3N0IG5vZGUgd2l0aCB0aGUgcHVyZSBjb21tZW50IGJlZm9yZSB0aGUgdmFyaWFibGUgZGVjbGFyYXRpb24gaW5pdGlhbGl6ZXIuXG4gIGNvbnN0IHZhcmlhYmxlRGVjbGFyYXRpb24gPSBob3N0Tm9kZS5kZWNsYXJhdGlvbkxpc3QuZGVjbGFyYXRpb25zWzBdO1xuICBjb25zdCBvdXRlclZhclN0bXQgPSBub2RlRmFjdG9yeS51cGRhdGVWYXJpYWJsZVN0YXRlbWVudChcbiAgICBob3N0Tm9kZSxcbiAgICBob3N0Tm9kZS5tb2RpZmllcnMsXG4gICAgbm9kZUZhY3RvcnkudXBkYXRlVmFyaWFibGVEZWNsYXJhdGlvbkxpc3QoaG9zdE5vZGUuZGVjbGFyYXRpb25MaXN0LCBbXG4gICAgICBub2RlRmFjdG9yeS51cGRhdGVWYXJpYWJsZURlY2xhcmF0aW9uKFxuICAgICAgICB2YXJpYWJsZURlY2xhcmF0aW9uLFxuICAgICAgICB2YXJpYWJsZURlY2xhcmF0aW9uLm5hbWUsXG4gICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24uZXhjbGFtYXRpb25Ub2tlbixcbiAgICAgICAgdmFyaWFibGVEZWNsYXJhdGlvbi50eXBlLFxuICAgICAgICBleHByZXNzaW9uLFxuICAgICAgKSxcbiAgICBdKSxcbiAgKTtcblxuICByZXR1cm4gb3V0ZXJWYXJTdG10O1xufVxuXG4vKipcbiAqIEZpbmQgZW51bXMsIGNsYXNzIGV4cHJlc3Npb24gb3IgZGVjbGFyYXRpb24gc3RhdGVtZW50cy5cbiAqXG4gKiBUaGUgY2xhc3NFeHByZXNzaW9ucyBibG9jayB0byB3cmFwIGluIGFuIGlpZmUgbXVzdFxuICogLSBlbmQgd2l0aCBhbiBFeHByZXNzaW9uU3RhdGVtZW50XG4gKiAtIGl0J3MgZXhwcmVzc2lvbiBtdXN0IGJlIGEgQmluYXJ5RXhwcmVzc2lvblxuICogLSBoYXZlIHRoZSBzYW1lIG5hbWVcbiAqXG4gKiBgYGBcbiBsZXQgRm9vID0gY2xhc3MgRm9vIHt9O1xuIEZvbyA9IF9fZGVjb3JhdGUoW10pO1xuIGBgYFxuICovXG5mdW5jdGlvbiBmaW5kU3RhdGVtZW50cyhcbiAgbmFtZTogc3RyaW5nLFxuICBzdGF0ZW1lbnRzOiB0cy5Ob2RlQXJyYXk8dHMuU3RhdGVtZW50PixcbiAgc3RhdGVtZW50SW5kZXg6IG51bWJlcixcbiAgb2Zmc2V0ID0gMCxcbik6IHRzLlN0YXRlbWVudFtdIHwgdW5kZWZpbmVkIHtcbiAgbGV0IGNvdW50ID0gMTtcblxuICBmb3IgKGxldCBpbmRleCA9IHN0YXRlbWVudEluZGV4ICsgMTsgaW5kZXggPCBzdGF0ZW1lbnRzLmxlbmd0aDsgKytpbmRleCkge1xuICAgIGNvbnN0IHN0YXRlbWVudCA9IHN0YXRlbWVudHNbaW5kZXhdO1xuICAgIGlmICghdHMuaXNFeHByZXNzaW9uU3RhdGVtZW50KHN0YXRlbWVudCkpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGNvbnN0IGV4cHJlc3Npb24gPSBzdGF0ZW1lbnQuZXhwcmVzc2lvbjtcblxuICAgIGlmICh0cy5pc0NhbGxFeHByZXNzaW9uKGV4cHJlc3Npb24pKSB7XG4gICAgICAvLyBFeDpcbiAgICAgIC8vIHNldENsYXNzTWV0YWRhdGEoRm9vQ2xhc3MsIFt7fV0sIHZvaWQgMCk7XG4gICAgICAvLyBfX2RlY29yYXRlKFtwcm9wRGVjb3JhdG9yKCldLCBGb29DbGFzcy5wcm90b3R5cGUsIFwicHJvcGVydHlOYW1lXCIsIHZvaWQgMCk7XG4gICAgICAvLyBfX2RlY29yYXRlKFtwcm9wRGVjb3JhdG9yKCldLCBGb29DbGFzcywgXCJwcm9wZXJ0eU5hbWVcIiwgdm9pZCAwKTtcbiAgICAgIC8vIF9fZGVjb3JhdGUkMShbcHJvcERlY29yYXRvcigpXSwgRm9vQ2xhc3MsIFwicHJvcGVydHlOYW1lXCIsIHZvaWQgMCk7XG4gICAgICBjb25zdCBhcmdzID0gZXhwcmVzc2lvbi5hcmd1bWVudHM7XG5cbiAgICAgIGlmIChhcmdzLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgY29uc3QgaXNSZWZlcmVuY2VkID0gYXJncy5zb21lKChhcmcpID0+IHtcbiAgICAgICAgICBjb25zdCBwb3RlbnRpYWxJZGVudGlmaWVyID0gdHMuaXNQcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24oYXJnKSA/IGFyZy5leHByZXNzaW9uIDogYXJnO1xuXG4gICAgICAgICAgcmV0dXJuIHRzLmlzSWRlbnRpZmllcihwb3RlbnRpYWxJZGVudGlmaWVyKSAmJiBwb3RlbnRpYWxJZGVudGlmaWVyLnRleHQgPT09IG5hbWU7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChpc1JlZmVyZW5jZWQpIHtcbiAgICAgICAgICBjb3VudCsrO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0cy5pc0JpbmFyeUV4cHJlc3Npb24oZXhwcmVzc2lvbikpIHtcbiAgICAgIGNvbnN0IG5vZGUgPSB0cy5pc0JpbmFyeUV4cHJlc3Npb24oZXhwcmVzc2lvbi5sZWZ0KSA/IGV4cHJlc3Npb24ubGVmdC5sZWZ0IDogZXhwcmVzc2lvbi5sZWZ0O1xuXG4gICAgICBjb25zdCBsZWZ0RXhwcmVzc2lvbiA9XG4gICAgICAgIHRzLmlzUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKG5vZGUpIHx8IHRzLmlzRWxlbWVudEFjY2Vzc0V4cHJlc3Npb24obm9kZSlcbiAgICAgICAgICA/IC8vIFN0YXRpYyBQcm9wZXJ0aWVzIC8vIEV4OiBGb28uYmFyID0gJ3ZhbHVlJztcbiAgICAgICAgICAgIC8vIEVOVU0gUHJvcGVydHkgLy8gRXg6ICBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneVtDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneS5EZWZhdWx0XSA9IFwiRGVmYXVsdFwiO1xuICAgICAgICAgICAgbm9kZS5leHByZXNzaW9uXG4gICAgICAgICAgOiAvLyBFeDogRm9vQ2xhc3MgPSBfX2RlY29yYXRlKFtDb21wb25lbnQoKV0sIEZvb0NsYXNzKTtcbiAgICAgICAgICAgIG5vZGU7XG5cbiAgICAgIGlmICh0cy5pc0lkZW50aWZpZXIobGVmdEV4cHJlc3Npb24pICYmIGxlZnRFeHByZXNzaW9uLnRleHQgPT09IG5hbWUpIHtcbiAgICAgICAgY291bnQrKztcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgYnJlYWs7XG4gIH1cblxuICBpZiAoY291bnQgPiAxKSB7XG4gICAgcmV0dXJuIHN0YXRlbWVudHMuc2xpY2Uoc3RhdGVtZW50SW5kZXggKyBvZmZzZXQsIHN0YXRlbWVudEluZGV4ICsgY291bnQpO1xuICB9XG5cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gdXBkYXRlRW51bUlpZmUoXG4gIG5vZGVGYWN0b3J5OiB0cy5Ob2RlRmFjdG9yeSxcbiAgaG9zdE5vZGU6IHRzLlZhcmlhYmxlU3RhdGVtZW50LFxuICBpaWZlOiB0cy5DYWxsRXhwcmVzc2lvbixcbiAgZXhwb3J0QXNzaWdubWVudD86IHRzLkV4cHJlc3Npb24sXG4pOiB0cy5TdGF0ZW1lbnRbXSB7XG4gIGlmIChcbiAgICAhdHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihpaWZlLmV4cHJlc3Npb24pIHx8XG4gICAgIXRzLmlzRnVuY3Rpb25FeHByZXNzaW9uKGlpZmUuZXhwcmVzc2lvbi5leHByZXNzaW9uKVxuICApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgSUlGRSBTdHJ1Y3R1cmUnKTtcbiAgfVxuXG4gIC8vIElnbm9yZSBleHBvcnQgYXNzaWdubWVudCBpZiB2YXJpYWJsZSBpcyBkaXJlY3RseSBleHBvcnRlZFxuICBpZiAoXG4gICAgaG9zdE5vZGUubW9kaWZpZXJzICYmXG4gICAgaG9zdE5vZGUubW9kaWZpZXJzLmZpbmRJbmRleCgobSkgPT4gbS5raW5kID09IHRzLlN5bnRheEtpbmQuRXhwb3J0S2V5d29yZCkgIT0gLTFcbiAgKSB7XG4gICAgZXhwb3J0QXNzaWdubWVudCA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGNvbnN0IGV4cHJlc3Npb24gPSBpaWZlLmV4cHJlc3Npb24uZXhwcmVzc2lvbjtcbiAgY29uc3QgdXBkYXRlZEZ1bmN0aW9uID0gbm9kZUZhY3RvcnkudXBkYXRlRnVuY3Rpb25FeHByZXNzaW9uKFxuICAgIGV4cHJlc3Npb24sXG4gICAgZXhwcmVzc2lvbi5tb2RpZmllcnMsXG4gICAgZXhwcmVzc2lvbi5hc3Rlcmlza1Rva2VuLFxuICAgIGV4cHJlc3Npb24ubmFtZSxcbiAgICBleHByZXNzaW9uLnR5cGVQYXJhbWV0ZXJzLFxuICAgIGV4cHJlc3Npb24ucGFyYW1ldGVycyxcbiAgICBleHByZXNzaW9uLnR5cGUsXG4gICAgbm9kZUZhY3RvcnkudXBkYXRlQmxvY2soZXhwcmVzc2lvbi5ib2R5LCBbXG4gICAgICAuLi5leHByZXNzaW9uLmJvZHkuc3RhdGVtZW50cyxcbiAgICAgIG5vZGVGYWN0b3J5LmNyZWF0ZVJldHVyblN0YXRlbWVudChleHByZXNzaW9uLnBhcmFtZXRlcnNbMF0ubmFtZSBhcyB0cy5JZGVudGlmaWVyKSxcbiAgICBdKSxcbiAgKTtcblxuICBsZXQgYXJnOiB0cy5FeHByZXNzaW9uID0gbm9kZUZhY3RvcnkuY3JlYXRlT2JqZWN0TGl0ZXJhbEV4cHJlc3Npb24oKTtcbiAgaWYgKGV4cG9ydEFzc2lnbm1lbnQpIHtcbiAgICBhcmcgPSBub2RlRmFjdG9yeS5jcmVhdGVCaW5hcnlFeHByZXNzaW9uKGV4cG9ydEFzc2lnbm1lbnQsIHRzLlN5bnRheEtpbmQuQmFyQmFyVG9rZW4sIGFyZyk7XG4gIH1cbiAgY29uc3QgdXBkYXRlZElpZmUgPSBub2RlRmFjdG9yeS51cGRhdGVDYWxsRXhwcmVzc2lvbihcbiAgICBpaWZlLFxuICAgIG5vZGVGYWN0b3J5LnVwZGF0ZVBhcmVudGhlc2l6ZWRFeHByZXNzaW9uKGlpZmUuZXhwcmVzc2lvbiwgdXBkYXRlZEZ1bmN0aW9uKSxcbiAgICBpaWZlLnR5cGVBcmd1bWVudHMsXG4gICAgW2FyZ10sXG4gICk7XG5cbiAgbGV0IHZhbHVlOiB0cy5FeHByZXNzaW9uID0gYWRkUHVyZUNvbW1lbnQodXBkYXRlZElpZmUpO1xuICBpZiAoZXhwb3J0QXNzaWdubWVudCkge1xuICAgIHZhbHVlID0gbm9kZUZhY3RvcnkuY3JlYXRlQmluYXJ5RXhwcmVzc2lvbihcbiAgICAgIGV4cG9ydEFzc2lnbm1lbnQsXG4gICAgICB0cy5TeW50YXhLaW5kLkZpcnN0QXNzaWdubWVudCxcbiAgICAgIHVwZGF0ZWRJaWZlLFxuICAgICk7XG4gIH1cblxuICByZXR1cm4gW3VwZGF0ZUhvc3ROb2RlKG5vZGVGYWN0b3J5LCBob3N0Tm9kZSwgdmFsdWUpXTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlV3JhcHBlZENsYXNzKFxuICBub2RlRmFjdG9yeTogdHMuTm9kZUZhY3RvcnksXG4gIGhvc3ROb2RlOiB0cy5DbGFzc0RlY2xhcmF0aW9uIHwgdHMuVmFyaWFibGVEZWNsYXJhdGlvbixcbiAgc3RhdGVtZW50czogdHMuU3RhdGVtZW50W10sXG4pOiB0cy5TdGF0ZW1lbnRbXSB7XG4gIGNvbnN0IG5hbWUgPSAoaG9zdE5vZGUubmFtZSBhcyB0cy5JZGVudGlmaWVyKS50ZXh0O1xuXG4gIGNvbnN0IHVwZGF0ZWRTdGF0ZW1lbnRzID0gWy4uLnN0YXRlbWVudHNdO1xuXG4gIGlmICh0cy5pc0NsYXNzRGVjbGFyYXRpb24oaG9zdE5vZGUpKSB7XG4gICAgdXBkYXRlZFN0YXRlbWVudHNbMF0gPSBub2RlRmFjdG9yeS5jcmVhdGVDbGFzc0RlY2xhcmF0aW9uKFxuICAgICAgaG9zdE5vZGUuZGVjb3JhdG9ycyxcbiAgICAgIHVuZGVmaW5lZCxcbiAgICAgIGhvc3ROb2RlLm5hbWUsXG4gICAgICBob3N0Tm9kZS50eXBlUGFyYW1ldGVycyxcbiAgICAgIGhvc3ROb2RlLmhlcml0YWdlQ2xhdXNlcyxcbiAgICAgIGhvc3ROb2RlLm1lbWJlcnMsXG4gICAgKTtcbiAgfVxuXG4gIGNvbnN0IHB1cmVJaWZlID0gYWRkUHVyZUNvbW1lbnQoXG4gICAgbm9kZUZhY3RvcnkuY3JlYXRlSW1tZWRpYXRlbHlJbnZva2VkQXJyb3dGdW5jdGlvbihbXG4gICAgICAuLi51cGRhdGVkU3RhdGVtZW50cyxcbiAgICAgIG5vZGVGYWN0b3J5LmNyZWF0ZVJldHVyblN0YXRlbWVudChub2RlRmFjdG9yeS5jcmVhdGVJZGVudGlmaWVyKG5hbWUpKSxcbiAgICBdKSxcbiAgKTtcblxuICBjb25zdCBtb2RpZmllcnMgPSBob3N0Tm9kZS5tb2RpZmllcnM7XG4gIGNvbnN0IGlzRGVmYXVsdCA9ICEhbW9kaWZpZXJzICYmIG1vZGlmaWVycy5zb21lKCh4KSA9PiB4LmtpbmQgPT09IHRzLlN5bnRheEtpbmQuRGVmYXVsdEtleXdvcmQpO1xuXG4gIGNvbnN0IG5ld1N0YXRlbWVudDogdHMuU3RhdGVtZW50W10gPSBbXTtcbiAgbmV3U3RhdGVtZW50LnB1c2goXG4gICAgbm9kZUZhY3RvcnkuY3JlYXRlVmFyaWFibGVTdGF0ZW1lbnQoXG4gICAgICBpc0RlZmF1bHQgPyB1bmRlZmluZWQgOiBtb2RpZmllcnMsXG4gICAgICBub2RlRmFjdG9yeS5jcmVhdGVWYXJpYWJsZURlY2xhcmF0aW9uTGlzdChcbiAgICAgICAgW25vZGVGYWN0b3J5LmNyZWF0ZVZhcmlhYmxlRGVjbGFyYXRpb24obmFtZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHB1cmVJaWZlKV0sXG4gICAgICAgIHRzLk5vZGVGbGFncy5MZXQsXG4gICAgICApLFxuICAgICksXG4gICk7XG5cbiAgaWYgKGlzRGVmYXVsdCkge1xuICAgIG5ld1N0YXRlbWVudC5wdXNoKFxuICAgICAgbm9kZUZhY3RvcnkuY3JlYXRlRXhwb3J0QXNzaWdubWVudChcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIGZhbHNlLFxuICAgICAgICBub2RlRmFjdG9yeS5jcmVhdGVJZGVudGlmaWVyKG5hbWUpLFxuICAgICAgKSxcbiAgICApO1xuICB9XG5cbiAgcmV0dXJuIG5ld1N0YXRlbWVudDtcbn1cbiJdfQ==
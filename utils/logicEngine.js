// utils/logicEngine.js
function evaluateCondition(answer, operator, expectedValue) {
    switch (operator) {
        case "equals":
            return answer === expectedValue;
        case "notEquals":
            return answer !== expectedValue;
        case "greaterThan":
            return Number(answer) > Number(expectedValue);
        case "lessThan":
            return Number(answer) < Number(expectedValue);
        case "includes":
            return Array.isArray(answer) && answer.includes(expectedValue);
        default:
            return false;
    }
}

function getNextQuestion(currentAnswer, currentQuestion) {
    if (!currentQuestion.logicRules || currentQuestion.logicRules.length === 0) {
        return null; // no branching → proceed normally
    }

    for (let rule of currentQuestion.logicRules) {
        const match = evaluateCondition(currentAnswer, rule.condition.operator, rule.condition.value);
        if (match) {
            return rule.nextQuestionId; // branching matched
        }
    }
    return null; // fallback
}

module.exports = { getNextQuestion };

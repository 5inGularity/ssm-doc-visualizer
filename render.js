function renderCondition(condition) {
    let operator = Object.keys(condition).filter(e => e !== "NextStep" && e !== "Variable")[0];
    return condition.Variable + " " + operator + " " + condition[operator];
}


function leaves(o, l) {
    if (typeof o === 'string') {
        l.push(o);
        return;
    }
    if (Array.isArray(o)) {
        for (const element of o) {
            leaves(element, l);
        }
        return;
    }
    if (typeof o === 'object') {
        let values = Object.values(o)
        for (const element of values) {
            leaves(element, l);
        }
        return;
    }
}

function render(doc, drawDeps, target) {
    const dotLines = [];
    const OUTPUT_REF_PATTERN = /{{([a-zA-Z0-9_]+\.[a-zA-Z0-9-_]+)?}}/g;
    dotLines.push('digraph {');
    dotLines.push('node [style="filled"]');
    let steps = doc.mainSteps;
    for (const element of steps) {
        let shape = element.isEnd ? "oval" : "rectangle";
        let label = element.name + '<br/><font point-size="10">' + element.action + '</font>'
        dotLines.push(element.name + '[shape="' + shape + '" label=<' + label + '>]')
    }
    for (let i = 0; i < steps.length; i++) {

        if (steps[i].action === "aws:branch") {
            let choices = steps[i].inputs.Choices
            for (const element of choices) {
                let label = "";
                if (element.Not) {
                    label = "Not " + renderCondition(element.Not);
                } else if (element.And) {
                    label = element.And.map(c => renderCondition(c)).join(" AND ");
                } else if (element.Or) {
                    label = element.Or.map(c => renderCondition(c)).join(" OR ");
                } else {
                    label = renderCondition(element);
                }
                dotLines.push(steps[i].name + " -> " + element.NextStep + ' [label="' + label + '"]');
            }
            if (steps[i].isEnd) {
                continue;
            } else if (steps[i].inputs.Default) {
                dotLines.push(steps[i].name + " -> " + steps[i].inputs.Default + ' [label="default"] ');
            } else if (steps[i].nextStep) {
                dotLines.push(steps[i].name + " -> " + steps[i].nextStep);
            } else if (i < steps.length - 1) {
                dotLines.push(steps[i].name + " -> " + steps[i + 1].name);
            }
        } else {
            if (steps[i].isEnd) {
                continue;
            } else if (steps[i].nextStep) {
                dotLines.push(steps[i].name + " -> " + steps[i].nextStep);
            } else if (i < steps.length - 1) {
                dotLines.push(steps[i].name + " -> " + steps[i + 1].name);
            }
        }
        if (steps[i].onFailure && steps[i].onFailure.startsWith('step')) {
            dotLines.push(steps[i].name + " -> " + steps[i].onFailure.split('step:')[1] + " [label=onFailure, color=red, style=dotted]");
        }
        if (steps[i].onCancel && steps[i].onCancel.startsWith('step')) {
            dotLines.push(steps[i].name + " -> " + steps[i].onCancel.split('step:')[1] + " [label=onCancel, color=red, style=dotted]");
        }
    }
    for (const element of steps) {
        if (drawDeps) {
            let l = [];
            leaves(element.inputs, l);
            let deps = l.filter(x => x.match(OUTPUT_REF_PATTERN)).map(x => Array.from(x.matchAll(OUTPUT_REF_PATTERN))).flat().map(x => x[0]);
            let depsSeen = []
            for (const dep of deps) {
                if (depsSeen.some(d => d === dep)) {
                    continue;
                }
                depsSeen.push(dep);
                let depStep = dep.match(/(?<={{).+(?=\.)/)[0];
                let depOutput = dep.match(/(?<=\.).+(?=}})/)[0];
                dotLines.push(depStep + " -> " + element.name + ' [style="dashed" label="' + depOutput + '"]');
            }
        }
    }
    dotLines.push('}');

    let graphviz = d3.select(target).graphviz();
    graphviz.renderDot(dotLines.join('\n'))
        .width(4000)
        .height(4000);
}
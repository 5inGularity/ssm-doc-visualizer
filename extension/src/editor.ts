import { TextDecoder } from 'util';
import * as vscode from 'vscode';

class SsmDocument implements vscode.CustomDocument {
    uri: vscode.Uri;

    constructor(private readonly u: vscode.Uri) {
        this.uri = u;
    }
    dispose(): void {
        return;
    }
}

export class SsmDocumentVisualizer implements vscode.CustomReadonlyEditorProvider {

    openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): vscode.CustomDocument | Thenable<vscode.CustomDocument> {
        console.log('Opening', uri.path);
        return new SsmDocument(uri);
    }
    resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): void | Thenable<void> {
        webviewPanel.webview.options = {
			enableScripts: true,
		};

        function updateWebview(text: string) {
			webviewPanel.webview.postMessage({
				type: 'update',
				text: text,
			});
		}
        // webviewPanel.webview.html = `
        // <!DOCTYPE html>
        // <html lang="en">
        // <head>
        // </head>
        // <body>
        //     <h1>Hello</h1>
        // </body>
        // `;
        webviewPanel.webview.html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <style>
            html,
            body {
              height: 100%;
              margin: 0;
              padding: 0;
            }
            
            
            .container {
              display: table;
            }
            
            .content {
              display: table-row;
              height: 100%;
            }
            
            .content-body {
              display: table-cell;
            }
            
            
            .container {
              width: 100%;
              height: 100%;
            }
            
            .header,
            .footer {
              padding: 10px 20px;
              background: #f7f7f7;
            }
            
            .content-body {
              padding: 20px;
              background: #e7e7e7;
            }
            </style>
        </head>
        <body>
            <script src="https://d3js.org/d3.v5.min.js"></script>
            <script src="https://unpkg.com/@hpcc-js/wasm@0.3.11/dist/index.min.js"></script>
            <script src="https://unpkg.com/d3-graphviz@3.0.5/build/d3-graphviz.js"></script>
            <script src="https://unpkg.com/js-yaml@3.12.0/dist/js-yaml.min.js"></script>
            <div class="container">
                <header class="header">
                    <label for="drawDeps">Show data dependencies? (reload doc to reflect change)</label>
                    <input type="checkbox" id="drawDeps" name="drawDeps">
                </header>
                <section class="content">
                    <div class="content-body">
                        <div id="graph" style="text-align: center; height: 100%"></div>
                        <div id="error" style="display:none;"></div>
                    </div>
                </section>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                const graph = (document.querySelector('#graph'));
                const error = (document.querySelector('#error'));


                window.addEventListener('message', event => {
                    const message = event.data;
                    switch(message.type) {
                        case 'update':
                            const text = message.text;
                            updateContent(text);
                            vscode.setState({text});
                    }
                });

                const state = vscode.getState();
                if (state) {
                    updateContent(state.text);
                }
    
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
                        for (let i = 0; i < o.length; i++) {
                            leaves(o[i], l);
                        }
                        return;
                    }
                    if (typeof o === 'object') {
                        let values = Object.values(o)
                        for (let i = 0; i < values.length; i++) {
                            leaves(values[i], l);
                        }
                        return;
                    }
                }

                function render(doc) {
                    const dotLines = [];
                    const OUTPUT_REF_PATTERN = /{{([a-zA-Z0-9_]+\.[a-zA-Z0-9-_]+)?}}/g;
                    dotLines.push('digraph {');
                    dotLines.push('node [style="filled"]');
                    let steps = doc.mainSteps;
                    for (let i = 0; i < steps.length; i++) {
                        let shape = steps[i].isEnd ? "oval" : "rectangle";
                        let label = steps[i].name + '<br/><font point-size="10">' + steps[i].action + '</font>'
                        dotLines.push(steps[i].name + '[shape="' + shape + '" label=<' + label + '>]')
                    }
                    for (let i = 0; i < steps.length; i++) {

                        if (steps[i].action === "aws:branch") {
                            let choices = steps[i].inputs.Choices
                            for (let j = 0; j < choices.length; j++) {
                                let label = "";
                                if (choices[j].Not) {
                                    label = "Not " + renderCondition(choices[j].Not);
                                } else if (choices[j].And) {
                                    label = choices[j].And.map(c => renderCondition(c)).join(" AND ");
                                } else if (choices[j].Or) {
                                    label = choices[j].Or.map(c => renderCondition(c)).join(" OR ");
                                } else {
                                    label = renderCondition(choices[j]);
                                }
                                dotLines.push(steps[i].name + " -> " + choices[j].NextStep + ' [label="' + label + '"]');
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
                    for (let i = 0; i < steps.length; i++) {
                        if (document.getElementById('drawDeps').checked) {
                            let l = [];
                            leaves(steps[i].inputs, l);
                            let deps = l.filter(x => x.match(OUTPUT_REF_PATTERN)).map(x => Array.from(x.matchAll(OUTPUT_REF_PATTERN))).flat().map(x => x[0]);
                            let depsSeen = []
                            for (let j = 0; j < deps.length; j++) {
                                if (depsSeen.some(d => d === deps[j])) {
                                    continue;
                                }
                                depsSeen.push(deps[j]);
                                let depStep = deps[j].match(/(?<={{).+(?=\.)/)[0];
                                let depOutput = deps[j].match(/(?<=\.).+(?=}})/)[0];
                                dotLines.push(depStep + " -> " + steps[i].name + ' [style="dashed" label="' + depOutput + '"]');
                            }
                        }
                    }
                    dotLines.push('}');

                    var graphviz = d3.select("#graph").graphviz();
                    graphviz.renderDot(dotLines.join('\\n'))
                        .width(4000)
                        .height(4000);
                }

                function updateContent(text) {
                    let doc;
                    try {
                        doc = jsyaml.load(text);
                    } catch {
                        graph.style.display = 'none';
                        error.innerText = 'Error: Document is not valid YAML';
                        error.style.display = '';
                        return;
                    }
                    graph.style.display = '';
                    error.style.display = 'none';
                    render(doc);
                }
            </script>
        </body>
        `;

        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview(e.document.getText());
            }
        });

        webviewPanel.onDidDispose(() => {
			changeDocumentSubscription.dispose();
		});

        vscode.workspace.fs.readFile(document.uri).then(fileContent => updateWebview(new TextDecoder().decode(fileContent)));
    }

    constructor(
        private readonly context: vscode.ExtensionContext
    ){}

    private static readonly viewType = 'ssm-doc-visualizer.visualizeSsm';

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
		const provider = new SsmDocumentVisualizer(context);
		const providerRegistration = vscode.window.registerCustomEditorProvider(SsmDocumentVisualizer.viewType, provider);
		return providerRegistration;
	}

}
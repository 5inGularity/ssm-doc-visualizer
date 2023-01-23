import { TextDecoder } from 'util';
import * as vscode from 'vscode';
// @ts-ignore
import renderScript from '../../render.js';

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
    
                ${renderScript}

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
                    render(doc, false, "#graph");
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
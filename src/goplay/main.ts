import path = require('path');
import * as vscode from 'vscode'
import * as os from 'os'
import * as fs from 'fs'
import * as child_process from 'child_process'

class NotFoundCodeSectionError extends Error { }
class ExecutionError extends Error {}

export class MarkdownGoPlay{
    private outputChannel: vscode.OutputChannel;

    constructor(){
        this.outputChannel = vscode.window.createOutputChannel("markdown-goplay")
    }

    private detectSource = (editor: vscode.TextEditor): [string, number] => {

        const cursorLine = editor.selection.active.line;
        let start: vscode.Position | null = null;

        for(let i = cursorLine; i >= 0; i--){
            const line = editor.document.lineAt(i);
            if(line.text.startsWith("```go")){
                start = editor.document.lineAt(i+1).range.start;
                break;
            }
        }

        if(!start){
            throw new NotFoundCodeSectionError();
        }

        let end: vscode.Position | null = null;
        for(let i=cursorLine; i < editor.document.lineCount; i++){
            const line = editor.document.lineAt(i);
            if(line.text.startsWith("```")){
                end = line.range.start;
                break;
            }
        }

        if(!end){
            throw new NotFoundCodeSectionError();
        }

        const code = editor.document.getText(new vscode.Range(start, end));
        return [code, end.line + 1];
    }
    public run = () => {
        if(!vscode.window.activeTextEditor){
            return;
        }
        try{
            const editor = vscode.window.activeTextEditor;
            const [code, endLine] = this.detectSource(editor);
            const cwd = this.getWorkdir(editor)
            const output = this.runGoCode(code, cwd)
            this.appendMDText(editor, endLine, output);
        }catch(e){
            if(e instanceof NotFoundCodeSectionError){
                vscode.window.showErrorMessage("Not found go code section");
            }
        }
    }
    
    private getWorkdir = (editor: vscode.TextEditor): string => {
        const conf = vscode.workspace.getConfiguration("markdownGoplay");
        const workdir = conf.get("workdir")
        if(workdir){
            return workdir as string
        }
        let fileDir = path.dirname(editor.document.uri.fsPath);
        return fileDir;
    }

    private runGoCode = (code: string, cwd: string): string => {
        this.outputChannel.clear();
        const codePath = path.join(os.tmpdir(), "main.go")
        fs.writeFileSync(codePath, code);
        const cmd = "go run " + codePath;

        this.outputChannel.appendLine(cmd);
        try{
            const buf = child_process.execSync(cmd, { cwd });

            const stdout = buf.toString();
            this.outputChannel.appendLine(stdout);
            return stdout;
        }catch(e){
            const err = e as Error
            this.outputChannel.append(err.toString());
            this.outputChannel.show();
            throw new ExecutionError();
        }
    }

    appendMDText = (editor: vscode.TextEditor, targetLine: number, text: string) => {
        let eol: string;
        switch(editor.document.eol){
            case vscode.EndOfLine.CRLF:
                eol = "\r\n";
            default:
                eol = "\n";
        }
        const outputText = "```" + eol + text + eol + "```" + eol;
        editor.edit( (editBuilder) => {
            editBuilder.insert(new vscode.Position(targetLine, 0), outputText)
        })
    }

}
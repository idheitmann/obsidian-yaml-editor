import { App, Modal, Setting } from "obsidian";

interface PromptOptions {
  title: string;
  placeholder?: string;
  initial?: string;
  cta?: string;
}

/**
 * Ask the user for a single line of text via an Obsidian modal.
 * Resolves to the trimmed string, or null if the user cancels or submits empty.
 *
 * This replaces `window.prompt`, which is disallowed by Obsidian's plugin
 * guidelines and does not work on mobile.
 */
export function promptForString(app: App, opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    new PromptModal(app, opts, resolve).open();
  });
}

class PromptModal extends Modal {
  private value: string;
  private resolved = false;

  constructor(app: App, private opts: PromptOptions, private resolve: (v: string | null) => void) {
    super(app);
    this.value = opts.initial ?? "";
  }

  override onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.opts.title);

    new Setting(contentEl).addText((text) => {
      text
        .setValue(this.value)
        .setPlaceholder(this.opts.placeholder ?? "")
        .onChange((v) => (this.value = v));
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.submit();
        }
      });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });

    new Setting(contentEl)
      .addButton((b) =>
        b
          .setButtonText(this.opts.cta ?? "OK")
          .setCta()
          .onClick(() => this.submit()),
      )
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
  }

  private submit(): void {
    const v = this.value.trim();
    this.finish(v.length > 0 ? v : null);
    this.close();
  }

  override onClose(): void {
    this.contentEl.empty();
    this.finish(null); // no-op if already resolved via submit
  }

  private finish(val: string | null): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolve(val);
  }
}

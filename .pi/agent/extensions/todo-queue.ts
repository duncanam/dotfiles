/**
 * Todo Queue Extension - Enhanced todo list with slash-command management
 *
 * Features:
 * - /todo add <text> — Add a task to the queue
 * - /todo list       — Show all tasks with interactive TUI
 * - /todo done <id>  — Mark a task as done
 * - /todo edit <id> <text> — Edit a task's text
 * - /todo delete <id> — Remove a task
 * - /todo clear      — Clear all tasks
 * - /todo reorder <id1> <id2> — Swap positions of two tasks
 * - todo tool for the LLM to manage todos
 * - Session-persistent state with proper branching support
 *
 * State is stored in tool result details, allowing proper branching
 * (undo/redo across session tree).
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  Key,
  Text,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Todo {
  id: number;
  text: string;
  done: boolean;
  createdAt: number;
}

interface TodoDetails {
  action: string;
  todos: Todo[];
  nextId: number;
  error?: string;
}

// ─── Schema for LLM tool ─────────────────────────────────────────────────────

const TodoParams = Type.Object({
  action: StringEnum(["list", "add", "toggle", "delete", "edit", "clear", "reorder"] as const),
  text: Type.Optional(Type.String({ description: "Todo text (for add / edit)" })),
  id: Type.Optional(Type.Number({ description: "Todo ID (for toggle / delete / edit)" })),
  id2: Type.Optional(Type.Number({ description: "Second todo ID (for reorder)" })),
});

// ─── Interactive TUI component ───────────────────────────────────────────────

class TodoTUI {
  private todos: Todo[];
  private theme: Theme;
  private onClose: () => void;
  private selectedIndex: number = 0;
  private mode: "view" | "delete" | "edit" = "view";
  private editingTodo: Todo | null = null;
  private editBuffer: string = "";
  private cachedWidth?: number;
  private cachedLines?: string[];
  private message: string = "";
  private messageTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(todos: Todo[], theme: Theme, onClose: () => void) {
    this.todos = todos;
    this.theme = theme;
    this.onClose = onClose;
  }

  /** Update the todo list (called externally when state changes) */
  setTodos(todos: Todo[]): void {
    this.todos = todos;
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, todos.length - 1));
    this.invalidate();
  }

  /** Show a temporary message */
  private flashMessage(msg: string): void {
    this.message = msg;
    if (this.messageTimeout) clearTimeout(this.messageTimeout);
    this.messageTimeout = setTimeout(() => {
      this.message = "";
      this.invalidate();
    }, 3000);
    this.invalidate();
  }

  /** Callbacks set externally */
  onToggle: ((id: number) => void) | null = null;
  onDelete: ((id: number) => void) | null = null;
  onEdit: ((id: number, text: string) => void) | null = null;
  onReorder: ((id1: number, id2: number) => void) | null = null;
  onAdd: (() => void) | null = null;

  handleInput(data: string): void {
    if (this.mode === "edit" && this.editingTodo) {
      this.handleEditInput(data);
      return;
    }

    if (matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c")) {
      if (this.mode === "delete") {
        this.mode = "view";
        this.flashMessage("Delete cancelled");
        return;
      }
      this.onClose();
      return;
    }

    // Help
    if (data === "?") {
      this.flashMessage(
        "↑↓ nav | space toggle | d delete | e edit | r reorder | a add | ? help | esc close",
      );
      return;
    }

    switch (this.mode) {
      case "delete":
        if (matchesKey(data, Key.enter) || data === "y") {
          const todo = this.todos[this.selectedIndex];
          if (todo && this.onDelete) {
            this.onDelete(todo.id);
            this.flashMessage(`Deleted todo #${todo.id}`);
          }
          this.mode = "view";
        } else if (data === "n" || data === "N") {
          this.mode = "view";
          this.flashMessage("Delete cancelled");
        }
        return;

      case "view":
        if (matchesKey(data, Key.up) || matchesKey(data, "k")) {
          if (this.selectedIndex > 0) {
            this.selectedIndex--;
            this.invalidate();
          }
        } else if (matchesKey(data, Key.down) || matchesKey(data, "j")) {
          if (this.selectedIndex < this.todos.length - 1) {
            this.selectedIndex++;
            this.invalidate();
          }
        } else if (matchesKey(data, Key.space) || matchesKey(data, Key.enter)) {
          // Toggle done state
          const todo = this.todos[this.selectedIndex];
          if (todo && this.onToggle) {
            this.onToggle(todo.id);
          }
        } else if (data === "d" || data === "D") {
          // Enter delete confirm mode
          if (this.todos.length > 0) {
            this.mode = "delete";
            this.flashMessage(
              `Delete #${this.todos[this.selectedIndex].id} "${truncateToWidth(this.todos[this.selectedIndex].text, 40)}"? (y/n)`,
            );
          }
        } else if (data === "e" || data === "E") {
          // Enter edit mode
          const todo = this.todos[this.selectedIndex];
          if (todo) {
            this.mode = "edit";
            this.editingTodo = todo;
            this.editBuffer = todo.text;
            this.flashMessage(`Editing todo #${todo.id} — press Enter to save, Esc to cancel`);
            this.invalidate();
          }
        } else if (data === "r" || data === "R") {
          // Start reorder: pick target via number key
          const todo = this.todos[this.selectedIndex];
          if (todo && this.todos.length > 1) {
            this.flashMessage(`Pick target position (1-${this.todos.length}) for #${todo.id}`);
          }
        } else if (data === "a" || data === "A") {
          if (this.onAdd) this.onAdd();
        } else if (data === "g") {
          // gg: go to top
          this.selectedIndex = 0;
          this.invalidate();
        } else if (data === "G") {
          // G: go to bottom
          this.selectedIndex = this.todos.length - 1;
          this.invalidate();
        }
        return;
    }
  }

  private handleEditInput(data: string): void {
    if (matchesKey(data, Key.enter)) {
      // Save edit
      const trimmed = this.editBuffer.trim();
      if (trimmed && this.editingTodo && this.onEdit) {
        this.onEdit(this.editingTodo.id, trimmed);
        this.flashMessage(`Updated todo #${this.editingTodo.id}`);
      }
      this.mode = "view";
      this.editingTodo = null;
      this.editBuffer = "";
      this.invalidate();
      return;
    }

    if (matchesKey(data, Key.escape)) {
      this.mode = "view";
      this.editingTodo = null;
      this.editBuffer = "";
      this.flashMessage("Edit cancelled");
      this.invalidate();
      return;
    }

    if (matchesKey(data, Key.backspace)) {
      this.editBuffer = this.editBuffer.slice(0, -1);
      this.invalidate();
    } else if (matchesKey(data, Key.delete)) {
      this.editBuffer = this.editBuffer.slice(1);
      this.invalidate();
    } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
      this.editBuffer += data;
      this.invalidate();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width && this.mode !== "edit") {
      return this.cachedLines;
    }

    const lines: string[] = [];
    const th = this.theme;

    // ── Header ──
    lines.push("");
    const title = th.fg("accent", " Todo Queue ");
    const headerLine =
      th.fg("borderMuted", "─".repeat(3)) +
      title +
      th.fg("borderMuted", "─".repeat(Math.max(0, width - 10 - title.length + 16)));
    lines.push(truncateToWidth(headerLine, width));
    lines.push("");

    // ── Stats ──
    if (this.todos.length > 0) {
      const done = this.todos.filter((t) => t.done).length;
      const total = this.todos.length;
      const pending = total - done;
      const stats =
        th.fg("muted", `${done}/${total} completed`) +
        (pending > 0 ? th.fg("dim", `  ·  ${pending} pending`) : th.fg("success", "  ✓ All done!"));
      lines.push(truncateToWidth(`  ${stats}`, width));
      lines.push("");
    }

    // ── Todo list ──
    if (this.todos.length === 0) {
      lines.push(truncateToWidth(`  ${th.fg("dim", "No todos yet. Use one of:")}`, width));
      lines.push(truncateToWidth(`  ${th.fg("dim", "  • /todo add <task>  —  add via command")}`, width));
      lines.push(truncateToWidth(`  ${th.fg("dim", "  • /todo <task>      —  shorthand")}`, width));
      lines.push(truncateToWidth(`  ${th.fg("dim", "  • Ask the agent    —  \"add a todo\"")}`, width));
      lines.push("");
    } else {
      for (let i = 0; i < this.todos.length; i++) {
        const todo = this.todos[i];
        const isSelected = i === this.selectedIndex && this.mode !== "edit";
        const isEditing = this.mode === "edit" && this.editingTodo?.id === todo.id;

        const prefix = isSelected ? th.fg("accent", "▸") : " ";
        const check = todo.done ? th.fg("success", "✓") : th.fg("dim", "○");
        const id = th.fg("accent", `#${todo.id}`);
        let text: string;

        if (isEditing) {
          // Show edit buffer inline
          const cursor = th.fg("accent", "█");
          text = `${th.fg("text", this.editBuffer)}${cursor}`;
        } else {
          text = todo.done ? th.fg("dim", todo.text) : th.fg("text", todo.text);
        }

        const line = `  ${prefix} ${check} ${id} ${text}`;
        lines.push(truncateToWidth(line, width));
      }
      lines.push("");
    }

    // ── Message bar ──
    if (this.message) {
      lines.push(truncateToWidth(`  ${th.fg("warning", this.message)}`, width));
      lines.push("");
    }

    // ── Footer help ──
    if (this.mode === "edit") {
      lines.push(truncateToWidth(`  ${th.fg("dim", "Enter to save · Esc to cancel · Type to edit")}`, width));
    } else if (this.mode === "delete") {
      // Already showing confirmation in message
    } else {
      lines.push(
        truncateToWidth(
          `  ${th.fg("dim", "↑↓ nav · space toggle · d delete · e edit · a add · ? help · esc close")}`,
          width,
        ),
      );
    }
    lines.push("");

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

// ─── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── In-memory state (reconstructed from session entries) ──
  let todos: Todo[] = [];
  let nextId = 1;

  // ── State reconstruction from session ──
  const reconstructState = (ctx: ExtensionContext) => {
    todos = [];
    nextId = 1;

    for (const entry of ctx.sessionManager.getBranch()) {
      // Reconstruct from LLM tool call results (proper branching support)
      if (entry.type === "message") {
        const msg = entry.message;
        if (msg.role === "toolResult" && msg.toolName === "todo") {
          const details = msg.details as TodoDetails | undefined;
          if (details) {
            todos = details.todos.map((t) => ({ ...t }));
            nextId = details.nextId;
          }
        }
      }
      // Reconstruct from command-driven state (appendEntry)
      if (entry.type === "custom" && entry.customType === "todo-queue") {
        const data = entry.data as { todos: Todo[]; nextId: number } | undefined;
        if (data) {
          todos = data.todos.map((t) => ({ ...t }));
          nextId = data.nextId;
        }
      }
    }
  };

  // Persist command-driven state changes (doesn't pollute LLM context)
  const saveState = () => {
    pi.appendEntry("todo-queue", { todos: todos.map((t) => ({ ...t })), nextId });
  };

  pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

  // ── Auto-nudge: after each agent turn, direct the agent to continue ──
  // Cooldown to avoid spamming: track last reminder time.
  let lastReminderTime = 0;
  const REMINDER_COOLDOWN_MS = 120_000; // 2 minutes

  pi.on("agent_end", (event) => {
    // Escape is an explicit user request to stop. Never turn an aborted/error
    // response into an automatic follow-up that immediately starts work again.
    const lastAssistant = [...event.messages]
      .reverse()
      .find((message) => message.role === "assistant") as { stopReason?: string } | undefined;
    if (lastAssistant?.stopReason === "aborted" || lastAssistant?.stopReason === "error") return;

    const now = Date.now();
    const openTodos = todos.filter((t) => !t.done);
    const openCount = openTodos.length;

    // If there are open todos and cooldown has elapsed, send a directive
    // telling the agent to continue with the next one. Do NOT ask — the
    // user put items in the todo list because they want them done.
    if (openCount > 0 && now - lastReminderTime > REMINDER_COOLDOWN_MS) {
      lastReminderTime = now;

      const nextTodo = openTodos[0];
      const directive = `Continue with the next open todo: #${nextTodo.id} "${nextTodo.text}". ` +
        `Do not ask for confirmation — just proceed with it.`;

      pi.sendUserMessage(directive, { deliverAs: "followUp" });
    }
  });

  // ── Helper: build tool result ──
  const result = (action: string, content: string, error?: string) => ({
    content: [{ type: "text" as const, text: content }],
    details: {
      action,
      todos: todos.map((t) => ({ ...t })),
      nextId,
      error,
    } as TodoDetails,
  });

  // ── Helper: rebuild after mutation ──
  const touch = (action: string, msg: string) => {
    return {
      content: [{ type: "text" as const, text: msg }],
      details: {
        action,
        todos: todos.map((t) => ({ ...t })),
        nextId,
      } as TodoDetails,
    };
  };

  // ── LLM tool: todo ──
  pi.registerTool({
    name: "todo",
    label: "Todo",
    description:
      "Manage a todo list queue. Actions: list, add (text), toggle (id), delete (id), edit (id, text), clear, reorder (id, id2). " +
      "The todo queue persists across the session and supports branching.",
    parameters: TodoParams,
    promptSnippet: "List, add, toggle, edit, delete, reorder, or clear items in the todo queue",
    promptGuidelines: [
      "Use todo to manage the user's task queue — add tasks they mention, mark them done, edit descriptions, or reorder prioritization.",
      "When the user says they want to track something, use todo add. When they finish something, use todo toggle.",
      "AUTOMATICALLY PROCEED: After completing a todo (toggling it to done), immediately continue to the next incomplete todo and start working on it. Do NOT ask the user what to do next or whether to proceed — just pick the first (or highest-priority) incomplete todo and begin work. The user put items in this list because they want them done, not to be asked about each one.",
      "NEVER ASK 'what to do next' or 'which todo to tackle' — always just pick the next one and go.",
    ],

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      switch (params.action) {
        case "list":
          if (todos.length === 0) {
            return result("list", "Todo queue is empty.");
          }
          return result(
            "list",
            todos
              .map((t) => `[${t.done ? "x" : " "}] #${t.id}: ${t.text}${t.done ? " (done)" : ""}`)
              .join("\n"),
          );

        case "add": {
          if (!params.text || !params.text.trim()) {
            return result("add", "Error: text parameter is required for adding a todo.", "text required");
          }
          const newTodo: Todo = {
            id: nextId++,
            text: params.text.trim(),
            done: false,
            createdAt: Date.now(),
          };
          todos.push(newTodo);
          return { ...touch("add", `Added todo #${newTodo.id}: ${newTodo.text}`) };
        }

        case "toggle": {
          if (params.id === undefined) {
            return result("toggle", "Error: id parameter is required for toggle.", "id required");
          }
          const todo = todos.find((t) => t.id === params.id);
          if (!todo) {
            return result("toggle", `Todo #${params.id} not found.`, `#${params.id} not found`);
          }
          todo.done = !todo.done;
          return { ...touch("toggle", `Todo #${todo.id} ${todo.done ? "completed" : "uncompleted"}: ${todo.text}`) };
        }

        case "delete": {
          if (params.id === undefined) {
            return result("delete", "Error: id parameter is required for delete.", "id required");
          }
          const idx = todos.findIndex((t) => t.id === params.id);
          if (idx === -1) {
            return result("delete", `Todo #${params.id} not found.`, `#${params.id} not found`);
          }
          const removed = todos.splice(idx, 1)[0];
          return { ...touch("delete", `Deleted todo #${removed.id}: ${removed.text}`) };
        }

        case "edit": {
          if (params.id === undefined || !params.text || !params.text.trim()) {
            return result("edit", "Error: id and text parameters are required for edit.", "id and text required");
          }
          const todo = todos.find((t) => t.id === params.id);
          if (!todo) {
            return result("edit", `Todo #${params.id} not found.`, `#${params.id} not found`);
          }
          const oldText = todo.text;
          todo.text = params.text.trim();
          return { ...touch("edit", `Updated todo #${todo.id}: "${oldText}" → "${todo.text}"`) };
        }

        case "clear": {
          const count = todos.length;
          todos = [];
          nextId = 1;
          return { ...touch("clear", `Cleared all ${count} todos.`) };
        }

        case "reorder": {
          if (params.id === undefined || params.id2 === undefined) {
            return result("reorder", "Error: id and id2 parameters are required for reorder.", "id and id2 required");
          }
          const idx1 = todos.findIndex((t) => t.id === params.id);
          const idx2 = todos.findIndex((t) => t.id === params.id2);
          if (idx1 === -1 || idx2 === -1) {
            return result("reorder", "One or both todos not found.", "id not found");
          }
          // Swap positions
          [todos[idx1], todos[idx2]] = [todos[idx2], todos[idx1]];
          return { ...touch("reorder", `Swapped #${params.id} and #${params.id2}`) };
        }

        default:
          return result("list", `Unknown action: ${params.action}`, `unknown action: ${params.action}`);
      }
    },

    // ── Custom TUI rendering ──
    renderCall(args, theme, _context) {
      let text = theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", args.action);
      if (args.text) text += ` ${theme.fg("dim", `"${args.text}"`)}`;
      if (args.id !== undefined) text += ` ${theme.fg("accent", `#${args.id}`)}`;
      if (args.id2 !== undefined) text += ` ${theme.fg("accent", `#${args.id2}`)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme, _context) {
      const details = result.details as TodoDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      if (details.error) {
        return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
      }

      const todoList = details.todos;

      switch (details.action) {
        case "list": {
          if (todoList.length === 0) {
            return new Text(theme.fg("dim", "No todos"), 0, 0);
          }
          let listText = theme.fg("muted", `${todoList.length} todo(s):`);
          const display = expanded ? todoList : todoList.slice(0, 8);
          for (const t of display) {
            const check = t.done ? theme.fg("success", "✓") : theme.fg("dim", "○");
            const itemText = t.done ? theme.fg("dim", t.text) : theme.fg("muted", t.text);
            listText += `\n${check} ${theme.fg("accent", `#${t.id}`)} ${itemText}`;
          }
          if (!expanded && todoList.length > 8) {
            listText += `\n${theme.fg("dim", `... ${todoList.length - 8} more (expand to see all)`)}`;
          }
          return new Text(listText, 0, 0);
        }

        case "add": {
          const added = todoList[todoList.length - 1];
          return new Text(
            theme.fg("success", "✓ Added ") +
              theme.fg("accent", `#${added.id}`) +
              " " +
              theme.fg("muted", added.text),
            0,
            0,
          );
        }

        case "toggle": {
          const text = result.content[0];
          const msg = text?.type === "text" ? text.text : "";
          return new Text(theme.fg("success", "✓ ") + theme.fg("muted", msg), 0, 0);
        }

        case "delete":
          return new Text(theme.fg("success", "✓ ") + theme.fg("muted", "Deleted"), 0, 0);

        case "edit":
          return new Text(theme.fg("success", "✓ ") + theme.fg("muted", "Edited"), 0, 0);

        case "clear":
          return new Text(theme.fg("success", "✓ ") + theme.fg("muted", "Cleared all todos"), 0, 0);

        case "reorder":
          return new Text(theme.fg("success", "✓ ") + theme.fg("muted", "Reordered"), 0, 0);
      }
    },
  });

  // ── Slash commands ──

  /**
   * /todo add <text>   — add a task
   * /todo <text>       — shorthand for add
   * /todo list         — open interactive TUI
   * /todo done <id>    — mark as done
   * /todo edit <id> <text> — edit text
   * /todo delete <id>  — remove task
   * /todo clear        — remove all
   * /todo reorder <id1> <id2> — swap positions
   */
  pi.registerCommand("todo", {
    description: "Manage the todo queue. Use: /todo add <task>, /todo list, /todo done <id>, /todo edit <id> <text>, /todo delete <id>, /todo clear, /todo reorder <id1> <id2>",

    handler: async (args, ctx) => {
      if (!args || args.trim() === "") {
        // No args: show interactive list
        await showTodoList(ctx);
        return;
      }

      // Parse: "/todo add fix the bug" → action="add", rest="fix the bug"
      // Also: "/todo fix the bug" → action="add", rest="fix the bug" (shorthand)
      const parts = args.trim().split(/\s+/);
      const subcommand = parts[0].toLowerCase();
      const rest = parts.slice(1).join(" ").trim();

      // Recognized subcommands
      const knownCommands = ["add", "list", "done", "edit", "delete", "clear", "reorder", "rm", "del", "remove"];

      if (subcommand === "list" || subcommand === "ls") {
        await showTodoList(ctx);
        return;
      }

      if (subcommand === "add" || !knownCommands.includes(subcommand)) {
        // "add" or shorthand: anything that's not a known command becomes "add"
        const text = subcommand === "add" ? rest : args.trim();
        if (!text) {
          ctx.ui.notify("Usage: /todo add <task description>", "warning");
          return;
        }
        const newTodo: Todo = { id: nextId++, text, done: false, createdAt: Date.now() };
        todos.push(newTodo);
        saveState();
        ctx.ui.notify(`Added todo #${newTodo.id}: ${text}`, "info");
        return;
      }

      if (subcommand === "done" || subcommand === "check" || subcommand === "complete") {
        if (!rest) {
          ctx.ui.notify("Usage: /todo done <id>", "warning");
          return;
        }
        const id = parseInt(rest, 10);
        if (isNaN(id)) {
          ctx.ui.notify("Invalid ID. Usage: /todo done <id>", "warning");
          return;
        }
        const todo = todos.find((t) => t.id === id);
        if (!todo) {
          ctx.ui.notify(`Todo #${id} not found`, "error");
          return;
        }
        todo.done = !todo.done;
        saveState();
        ctx.ui.notify(`Todo #${todo.id} ${todo.done ? "completed" : "uncompleted"}: ${todo.text}`, "info");
        return;
      }

      if (subcommand === "delete" || subcommand === "del" || subcommand === "rm" || subcommand === "remove") {
        if (!rest) {
          ctx.ui.notify("Usage: /todo delete <id>", "warning");
          return;
        }
        const id = parseInt(rest, 10);
        if (isNaN(id)) {
          ctx.ui.notify("Invalid ID. Usage: /todo delete <id>", "warning");
          return;
        }
        const idx = todos.findIndex((t) => t.id === id);
        if (idx === -1) {
          ctx.ui.notify(`Todo #${id} not found`, "error");
          return;
        }
        const removed = todos.splice(idx, 1)[0];
        saveState();
        ctx.ui.notify(`Deleted todo #${removed.id}: ${removed.text}`, "info");
        return;
      }

      if (subcommand === "edit" || subcommand === "update") {
        const idStr = parts[1];
        const newText = parts.slice(2).join(" ").trim();
        if (!idStr || !newText) {
          ctx.ui.notify("Usage: /todo edit <id> <new text>", "warning");
          return;
        }
        const id = parseInt(idStr, 10);
        if (isNaN(id)) {
          ctx.ui.notify("Invalid ID. Usage: /todo edit <id> <new text>", "warning");
          return;
        }
        const todo = todos.find((t) => t.id === id);
        if (!todo) {
          ctx.ui.notify(`Todo #${id} not found`, "error");
          return;
        }
        const oldText = todo.text;
        todo.text = newText;
        saveState();
        ctx.ui.notify(`Updated todo #${id}: "${oldText}" → "${newText}"`, "info");
        return;
      }

      if (subcommand === "clear") {
        const count = todos.length;
        todos = [];
        nextId = 1;
        saveState();
        ctx.ui.notify(`Cleared all ${count} todos`, "info");
        return;
      }

      if (subcommand === "reorder" || subcommand === "swap" || subcommand === "move") {
        const id1Str = parts[1];
        const id2Str = parts[2];
        if (!id1Str || !id2Str) {
          ctx.ui.notify("Usage: /todo reorder <id1> <id2>", "warning");
          return;
        }
        const id1 = parseInt(id1Str, 10);
        const id2 = parseInt(id2Str, 10);
        if (isNaN(id1) || isNaN(id2)) {
          ctx.ui.notify("Invalid IDs. Usage: /todo reorder <id1> <id2>", "warning");
          return;
        }
        const idx1 = todos.findIndex((t) => t.id === id1);
        const idx2 = todos.findIndex((t) => t.id === id2);
        if (idx1 === -1 || idx2 === -1) {
          ctx.ui.notify("One or both todos not found", "error");
          return;
        }
        [todos[idx1], todos[idx2]] = [todos[idx2], todos[idx1]];
        saveState();
        ctx.ui.notify(`Swapped #${id1} and #${id2}`, "info");
        return;
      }

      ctx.ui.notify(
        "Usage: /todo add <text>, /todo list, /todo done <id>, /todo edit <id> <text>, /todo delete <id>, /todo clear, /todo reorder <id1> <id2>",
        "warning",
      );
    },
  });

  // ── Interactive TUI display ──
  async function showTodoList(ctx: {
    mode: string;
    ui: {
      custom: <T>(
        factory: (
          tui: any,
          theme: Theme,
          kb: any,
          done: (value: T) => void,
        ) => any,
        options?: any,
      ) => Promise<T | undefined>;
      notify: (msg: string, type: "info" | "warning" | "error") => void;
    };
  }): Promise<void> {
    if (ctx.mode !== "tui") {
      // Fallback: just print to notification
      const lines = todos.length === 0
        ? ["No todos."]
        : todos.map((t) => `  [${t.done ? "x" : " "}] #${t.id}: ${t.text}`);
      ctx.ui.notify(lines.join("\n"), "info");
      return;
    }

    await ctx.ui.custom<void>((tui, theme, _kb, done) => {
      const component = new TodoTUI(todos, theme, () => done());

      // Wire up callbacks
      component.onToggle = (id: number) => {
        const todo = todos.find((t) => t.id === id);
        if (todo) {
          todo.done = !todo.done;
          component.setTodos([...todos]);
          saveState();
        }
      };

      component.onDelete = (id: number) => {
        const idx = todos.findIndex((t) => t.id === id);
        if (idx !== -1) {
          todos.splice(idx, 1);
          component.setTodos([...todos]);
          saveState();
        }
      };

      component.onEdit = (id: number, text: string) => {
        const todo = todos.find((t) => t.id === id);
        if (todo) {
          todo.text = text;
          component.setTodos([...todos]);
          saveState();
        }
      };

      component.onAdd = () => {
        done();
        // After closing, prompt for input via /todo command mechanism
        // We use a small trick: show a notification then user can type /todo add ...
        ctx.ui.notify("Use: /todo add <task> to add a new todo", "info");
      };

      return component;
    });
  }
}

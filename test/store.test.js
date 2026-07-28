import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../server/store.js";

test("memory store handles session lifecycle and cascade delete", async () => {
  const store = new MemoryStore();
  const session = await store.createSession("测试");
  await store.addMessage(session.id, "user", "你好");
  await store.addMemory(session.id, "用户问好");
  assert.equal((await store.listMessages(session.id)).length, 1);
  assert.equal((await store.listMemories(session.id)).length, 1);
  await store.deleteSession(session.id);
  assert.equal((await store.listMessages(session.id)).length, 0);
});

test("hidden messages are excluded from active context", async () => {
  const store = new MemoryStore();
  const session = await store.createSession();
  const first = await store.addMessage(session.id, "user", "旧消息");
  await store.addMessage(session.id, "assistant", "新消息");
  await store.hideMessages([first.id]);
  assert.deepEqual((await store.listMessages(session.id)).map((item) => item.content), ["新消息"]);
});

test("all memories include their real session names", async () => {
  const store = new MemoryStore();
  const session = await store.createSession("真实对话");
  await store.addMemory(session.id, "真实记忆");
  const memories = await store.listAllMemories();
  assert.equal(memories.length, 1);
  assert.equal(memories[0].sessions.name, "真实对话");
});

test("a memory can be edited and remains updated", async () => {
  const store = new MemoryStore();
  const session = await store.createSession("可编辑记忆");
  const memory = await store.addMemory(session.id, "旧内容");
  const updated = await store.updateMemory(memory.id, "新的完整内容");
  assert.equal(updated.summary, "新的完整内容");
  assert.equal((await store.listMemories(session.id))[0].summary, "新的完整内容");
});

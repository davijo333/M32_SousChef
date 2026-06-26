import assert from "node:assert/strict";
import test from "node:test";

import {
  detectUploadConfirm,
  hasReadyUploadBatch,
  threadAwaitingUploadConfirm,
} from "./chat-upload-intent.ts";

test("detectUploadConfirm matches yes", () => {
  assert.equal(detectUploadConfirm("yes"), true);
});

test("confirmUpload requires upload context for bare yes", () => {
  const yes = detectUploadConfirm("yes");
  assert.equal(yes, true);
  assert.equal(hasReadyUploadBatch(null), false);
  assert.equal(threadAwaitingUploadConfirm([]), false);
  assert.equal(
    yes &&
      (hasReadyUploadBatch(null) || threadAwaitingUploadConfirm([])),
    false
  );
});

test("threadAwaitingUploadConfirm detects bill upload gate", () => {
  assert.equal(
    threadAwaitingUploadConfirm([
      { role: "assistant", content: "Please confirm processing these bills." },
    ]),
    true
  );
  assert.equal(
    threadAwaitingUploadConfirm([
      { role: "assistant", content: "Ready to link glazed bananas to Pancakes?" },
    ]),
    false
  );
});

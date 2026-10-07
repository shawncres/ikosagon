# IkoAgent RAG corpus

Each folder (`cs/`, `collections/`, `sales/`) is one flow's policy corpus. Files are
split into chunks at each `##` heading.

## Who sees what

- **Section text is agent-only guidance.** That covers instructions, disposition codes,
  and "Say this" scripts. The LLM gets it labelled `AGENT-ONLY GUIDANCE` and is told to
  follow it without saying it. Copied sentences are removed from replies
  (`stripAgentGuidance`), and the scripted fallback never shows it.
- **Caller-safe lines come only from authored comments.** Put one right under a heading:

  ```md
  ## Lost package
  <!-- caller: If a package has had no tracking updates for 7 days past the expected delivery date, we treat it as lost and can send a replacement or issue a refund. -->
  After **7 calendar days** with no scan updates … Log disposition `SHIP_LOST`.
  ```

  The scripted fallback can say these lines on policy steps (`rag.required`) as
  "Here's what our policy says: …". The LLM can paraphrase them.
- **Frontmatter `skipWhenVerified: true`** removes the whole file from retrieval once the
  caller's account is verified or created. Use it for identity and account-failure guidance.

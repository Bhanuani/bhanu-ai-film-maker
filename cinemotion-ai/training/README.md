# CINEMOTION training data and fine-tuning

Do not fine-tune immediately. First build a reviewed evaluation set and a clean supervised dataset. Poor examples will teach the model poor cinematography.

## Dataset format

One JSON object per line (JSONL), following `dataset.schema.json`.

Each example should contain:
- user brief in original language (Telugu script, Romanized Telugu, English, or mixed)
- duration
- optional specialist/VFX/Vault context
- high-quality final answer
- explicit constraints that the answer must preserve
- review metadata and source/permission

## Collection rules

1. Use only content you own, have permission to use, or can legally reuse.
2. Do not scrape copyrighted prompt libraries or private user content without consent.
3. Keep Telugu-script and Romanized Telugu examples separate in metadata.
4. Include negative examples only with a corrected target answer and clear error labels.
5. Have a human reviewer verify camera physics, continuity, timecodes and constraint fidelity.
6. Keep a held-out test set. Never train on the evaluation set.

## Fine-tuning phase

After the dataset is large and consistently reviewed, evaluate QLoRA/LoRA fine-tuning of the Qwen base model on a dedicated GPU machine. The GT 730 is not suitable for this training workload. Pin the exact base-model revision, tokenizer, training code and license before training. Record dataset version, adapter version and evaluation results for every release.

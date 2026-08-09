<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    class: className = '',
    children,
  }: { class?: string; children?: Snippet } = $props()
</script>

<div
  class="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-6 text-[var(--text-primary)] backdrop-blur-[var(--glass-blur)] {className}"
>
  {@render children?.()}
</div>

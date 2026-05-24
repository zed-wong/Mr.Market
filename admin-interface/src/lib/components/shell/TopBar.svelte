<script lang="ts">
  import { _ } from 'svelte-i18n';

  interface Props {
    onToggleSidebar: () => void;
  }

  let { onToggleSidebar }: Props = $props();
</script>

<header class="sticky top-0 z-30 bg-base-100/90 backdrop-blur">
  <div class="flex min-h-15 items-center gap-3 px-5 py-4 md:px-8">
    <button
      type="button"
      class="btn-pill-ghost -ml-3"
      onclick={onToggleSidebar}
      aria-label={$_('toggle_sidebar')}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="size-6"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
        />
      </svg>
    </button>
  </div>
</header>

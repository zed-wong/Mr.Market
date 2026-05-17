<script lang="ts">
  interface Props {
    values: number[];
    width?: number;
    height?: number;
    positive?: boolean;
    fill?: boolean;
  }

  let { values, width = 120, height = 36, positive = true, fill = true }: Props = $props();

  let path = $derived.by(() => {
    if (!values.length) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const stepX = values.length > 1 ? width / (values.length - 1) : 0;
    return values
      .map((v, i) => {
        const x = i * stepX;
        const y = height - ((v - min) / range) * height;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  });

  let areaPath = $derived(path ? `${path} L ${width} ${height} L 0 ${height} Z` : '');
  let strokeClass = $derived(positive ? 'text-success' : 'text-error');
</script>

<svg
  {width}
  {height}
  viewBox="0 0 {width} {height}"
  class="overflow-visible"
  aria-hidden="true"
>
  {#if fill}
    <path d={areaPath} fill="currentColor" class={strokeClass} fill-opacity="0.08" />
  {/if}
  <path
    d={path}
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    class={strokeClass}
  />
</svg>

// Calls `fn` once, `wait` ms after the last call, with that call's arguments (CNOTE-18 search typing)
export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, wait: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return {
    call(...args: Args) {
      cancel();
      timer = setTimeout(() => {
        timer = undefined;
        fn(...args);
      }, wait);
    },
    cancel,
  };
}

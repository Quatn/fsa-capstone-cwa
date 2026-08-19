export type DataHookObject<T> = {
  data: T;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
};

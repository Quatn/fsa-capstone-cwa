import { DataHookObject } from "@/types/DataHookObject";
import { useEffect, useRef, useState } from "react";

export function useFetch<T, TArgs extends unknown[]>(
  initialData: T,
  func: (...args: TArgs) => Promise<T>,
  params: TArgs = [] as unknown as TArgs,
  options?: {
    skip?: boolean;
  }
): DataHookObject<T> {
  const [data, setData] = useState<DataHookObject<T>>({
    data: initialData,
    isLoading: false,
    isFetching: false,
    error: null
  });

  const hasFetched = useRef(false);

  useEffect(() => {
    if (options?.skip) {
      return;
    }

    let isActive = true;

    const fetchData = async () => {
      setData((previous) => ({
        ...previous,
        isLoading: !hasFetched.current,
        isFetching: true,
        error: null
      }));

      try {
        const result = await func(...params);

        if (!isActive) {
          return;
        }

        hasFetched.current = true;

        setData((previous) => ({
          ...previous,
          data: result,
          isLoading: false,
          isFetching: false,
          error: null
        }));
      } catch (reason) {
        if (!isActive) {
          return;
        }

        hasFetched.current = true;

        const error =
          reason instanceof Error ? reason : new Error(String(reason));

        setData((previous) => ({
          ...previous,
          isLoading: false,
          isFetching: false,
          error
        }));
      }
    };

    void fetchData();

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [func, options?.skip, ...params]);

  return data;
}

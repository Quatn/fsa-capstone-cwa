import { ApiErrorValues } from "@/lib/errors/ApiErrorValues";
import isApiResponse from "./isApiResponse";
import { AxiosError } from "axios";

export default function parseApiErrorValue(error: unknown): ApiErrorValues | null {
  if (error instanceof AxiosError) {
    const serverErrorResponse = error.response?.data;
    if (isApiResponse(serverErrorResponse) && !serverErrorResponse.success) {
      return serverErrorResponse.error;
    }
  }

  return null;
}

import { ApiResponse } from "@/lib/ApiResponse";
import api from "../api";
import { UserDetails } from "@/lib/types/dto/UserDetails";

export const refreshSession = async (): Promise<ApiResponse<{
  userDetails: UserDetails,
  accessToken: string
}>> => {
  const response = await api.get("/auth/refresh");
  return response.data;
};

export const login = async (email: string, password: string): Promise<ApiResponse<UserDetails>> => {
  const response = await api.post("/auth/login", { loginKey: email, password });
  return response.data;
};

// TODO
// export const register = async (email: string, password: string) => {
//   try {
//     const response = await api.post("/auth/register", { loginKey: email, password });
//     return response.data;
//   }
//   catch (error) {
//     console.log(error);
//   }
// };

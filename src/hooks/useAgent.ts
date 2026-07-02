import { useCallback, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "@/utils/api";

const API_URL = API_BASE_URL;

export interface AgentCommand {
  action: string;
  params?: Record<string, unknown>;
  data?: Record<string, unknown>;
  error?: string;
}

export interface AgentResponse {
  commands: AgentCommand[];
  explanation: string;
  suggested_next: string;
}

export function useAgent() {
  const [isThinking, setIsThinking] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [suggestedNext, setSuggestedNext] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (message: string): Promise<AgentCommand[]> => {
    setIsThinking(true);
    setError(null);
    try {
      const res = await axios.post<AgentResponse>(`${API_URL}/agent`, { message });
      const { commands, explanation: exp, suggested_next } = res.data;
      setExplanation(exp);
      setSuggestedNext(suggested_next);
      return commands;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      setExplanation("Something went wrong connecting to the backend.");
      setSuggestedNext("");
      return [];
    } finally {
      setIsThinking(false);
    }
  }, []);

  return { submit, isThinking, explanation, suggestedNext, error };
}

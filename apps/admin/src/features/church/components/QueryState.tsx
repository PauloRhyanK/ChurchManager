import type { UseQueryResult } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/api";

interface QueryStateProps<T> {
  query: UseQueryResult<T>;
  loadingText: string;
  /** Texto exibido somente quando a consulta teve sucesso e não há itens. */
  emptyText?: string;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}

/** Carregando, erro (com "Tentar novamente") e vazio são estados distintos. */
export function QueryState<T>({ query, loadingText, emptyText, isEmpty, children }: QueryStateProps<T>) {
  if (query.data === undefined) {
    if (query.isError) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar os dados</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{getApiErrorMessage(query.error)}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {query.isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      );
    }
    return (
      <div className="flex justify-center py-8 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> {loadingText}
      </div>
    );
  }
  if (emptyText && isEmpty?.(query.data)) {
    return (
      <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
        {emptyText}
      </div>
    );
  }
  return <>{children(query.data)}</>;
}

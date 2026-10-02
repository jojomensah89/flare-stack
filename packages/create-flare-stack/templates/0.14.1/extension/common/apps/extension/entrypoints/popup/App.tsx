import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { CheckCircle2, ExternalLink, Layers, Power, Sparkles } from "lucide-react";
import { useState } from "react";

export function App() {
  const [isEnabled, setIsEnabled] = useState(true);
  const [clickCount, setClickCount] = useState(0);

  return (
    <div className="flex flex-col gap-3 w-80 font-sans">
      <Card className="border border-border/80 shadow-sm bg-card text-card-foreground">
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 text-primary">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold tracking-tight">
                  {"{{PROJECT_NAME}}"}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Flare Stack • WXT + React
                </CardDescription>
              </div>
            </div>
            <div
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                isEnabled
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isEnabled ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50"
                }`}
              />
              {isEnabled ? "Active" : "Paused"}
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-4 pb-3 space-y-3">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Status</span>
              <span className="font-mono text-foreground font-medium">Ready</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Trigger count</span>
              <span className="font-mono text-foreground font-medium">{clickCount}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={isEnabled ? "outline" : "default"}
              size="sm"
              className="flex-1 text-xs gap-1.5"
              onClick={() => setIsEnabled(!isEnabled)}
            >
              <Power className="h-3.5 w-3.5" />
              {isEnabled ? "Disable" : "Enable"}
            </Button>
            <Button
              variant="default"
              size="sm"
              className="flex-1 text-xs gap-1.5"
              disabled={!isEnabled}
              onClick={() => setClickCount((c) => c + 1)}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Test Action
            </Button>
          </div>
        </CardContent>

        <CardFooter className="px-4 py-2.5 border-t border-border/50 bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="h-3 w-3" />
            Manifest V3
          </span>
          <a
            href="https://wxt.dev"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            WXT Docs
            <ExternalLink className="h-3 w-3" />
          </a>
        </CardFooter>
      </Card>
    </div>
  );
}

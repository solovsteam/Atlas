import { Link } from "react-router-dom";

export function NowPage() {
  return (
    <section>
      <h1 className="text-4xl font-bold tracking-tight">Now</h1>
      <p className="mt-2 max-w-xl text-sm text-neutral-400">
        Focus view for what to do in this moment — tasks in the current calendar interval and today&apos;s committed
        list. Coming soon.
      </p>
      <p className="mt-6 text-sm text-neutral-500">
        For active tasks and quick add, go to{" "}
        <Link className="text-neutral-300 underline hover:text-white" to="/tasks">
          Tasks
        </Link>
        . Browse and plan everything in{" "}
        <Link className="text-neutral-300 underline hover:text-white" to="/items">
          Items
        </Link>
        .
      </p>
    </section>
  );
}

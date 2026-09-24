"use client";

// FR-043: owner adds, renames, and deletes categories. A category that still has products shows
// why it can't be deleted instead of a Delete button (the server refuses it either way).
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { TextField } from "@/components/ui/field";
import { useResultAction } from "@/components/ui/use-result-action";
import { createCategory, deleteCategory, renameCategory } from "./actions";
import type { CategoryRow } from "./queries";

function AddCategoryForm() {
  const { pending, fieldErrors, run } = useResultAction();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "");
    run(() => createCategory({ name }), {
      success: (category) => `Category “${category.name}” added.`,
      onSuccess: () => form.reset(),
    });
  }

  return (
    <section aria-labelledby="add-category-title" className="bg-surface rounded-lg p-4 lg:p-6">
      <h2 id="add-category-title" className="text-text text-lg font-semibold">
        Add category
      </h2>
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-wrap items-start gap-3">
        <TextField
          label="Category name"
          name="name"
          required
          autoComplete="off"
          placeholder="e.g. Bags"
          errors={fieldErrors.name}
          className="w-full sm:max-w-sm"
        />
        <Button type="submit" icon={Plus} disabled={pending} className="sm:mt-7">
          {pending ? "Adding…" : "Add category"}
        </Button>
      </form>
    </section>
  );
}

function RenameForm({ category, onDone }: { category: CategoryRow; onDone: () => void }) {
  const { pending, fieldErrors, run } = useResultAction();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    run(() => renameCategory({ id: category.id, name }), {
      success: (renamed) => `Renamed to “${renamed.name}”.`,
      onSuccess: onDone,
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex w-full flex-wrap items-start gap-3">
      <TextField
        label={`New name for ${category.name}`}
        name="name"
        required
        autoComplete="off"
        defaultValue={category.name}
        errors={fieldErrors.name}
        className="w-full sm:max-w-sm"
      />
      <div className="flex gap-2 sm:mt-7">
        <Button type="submit" icon={Save} disabled={pending}>
          {pending ? "Saving…" : "Save name"}
        </Button>
        <Button variant="ghost" icon={X} onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function CategoryItem({ category }: { category: CategoryRow }) {
  const [renaming, setRenaming] = useState(false);
  const { pending, run } = useResultAction();
  const count = category.productCount;

  if (renaming) {
    return (
      <li className="py-4 first:pt-0 last:pb-0">
        <RenameForm category={category} onDone={() => setRenaming(false)} />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-text font-medium">{category.name}</p>
        <p className="text-muted text-sm">
          {count === 0 ? "No products" : count === 1 ? "1 product" : `${count} products`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" icon={Pencil} onClick={() => setRenaming(true)}>
          Rename
        </Button>
        {count === 0 ? (
          <ConfirmButton
            icon={Trash2}
            label="Delete"
            question={`Delete “${category.name}”?`}
            confirmLabel="Yes, delete"
            pending={pending}
            onConfirm={() =>
              run(() => deleteCategory({ id: category.id }), {
                success: `Category “${category.name}” deleted.`,
              })
            }
          />
        ) : (
          <p className="text-muted text-sm">In use, so it can&apos;t be deleted</p>
        )}
      </div>
    </li>
  );
}

export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  return (
    <>
      <AddCategoryForm />
      <section aria-labelledby="categories-title" className="bg-surface rounded-lg p-4 lg:p-6">
        <h2 id="categories-title" className="text-text text-lg font-semibold">
          Categories
        </h2>
        {categories.length === 0 ? (
          <p className="text-muted mt-2">No categories yet. Add the first one above.</p>
        ) : (
          <ul className="divide-border mt-4 divide-y" aria-label="Categories">
            {categories.map((category) => (
              <CategoryItem key={category.id} category={category} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

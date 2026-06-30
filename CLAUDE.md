# CLAUDE.md

This document defines the engineering rules for this repository.

These rules take priority over default coding habits unless the user explicitly requests otherwise.

---

# Philosophy

This project values maintainability above speed.

Every change should make the codebase easier to understand.

Always optimize for:

- readability
- consistency
- simplicity
- low coupling
- high cohesion

Avoid clever code.

Avoid unnecessary abstractions.

Prefer boring solutions.

---

# Development Workflow

Every implementation follows this order.

## 1. Understand

Before writing code:

- Understand the request.
- Search the existing code.
- Understand current patterns.
- Reuse existing solutions whenever possible.

Never start coding immediately.

---

## 2. Plan

Think before implementing.

If the task is non-trivial:

- identify affected modules
- identify possible side effects
- explain the implementation plan

Never implement blindly.

---

## 3. Implement

Write the minimum amount of code required.

Do not refactor unrelated areas.

Avoid introducing new patterns unless clearly superior.

---

## 4. Review

Before finishing, verify:

- duplicated logic
- dead code
- unnecessary complexity
- unused imports
- unused state
- accessibility
- typing
- naming
- formatting

Leave the project slightly better than you found it.

---

# Architecture

Prefer Feature-first architecture.

Business logic belongs inside features.

Global folders should contain only reusable code.

Good:

features/
    coffee/
        api/
        hooks/
        components/
        types/

Bad:

components/
coffee/
hooks/
pages/

where feature code is spread across the project.

If creating a new feature, suggest moving toward feature-based organization instead of creating another top-level folder.

---

# Frontend

Stack

- React 18
- TypeScript
- Vite
- Tailwind v4
- Radix UI
- React Query
- Lucide
- Sonner

---

## React

Prefer:

- functional components
- composition
- early returns
- derived state

Avoid:

- deeply nested JSX
- prop drilling
- unnecessary Context
- unnecessary effects

If state can be derived,
don't store it.

---

## Components

Components should only render UI.

Business logic belongs in:

- hooks
- services
- feature modules

Split components when they become difficult to understand.

Target:

<200 lines

---

## Hooks

Hooks encapsulate behavior.

Hooks should never render UI.

Avoid hooks that become "god objects".

---

## React Query

React Query is the default server state solution.

Do not duplicate server state into Context.

Prefer:

- invalidateQueries
- optimistic updates only when beneficial
- proper query keys

---

## Context

Use Context only for:

- authentication
- theme
- user preferences
- truly shared UI state

Do not use Context as a global store.

---

# Backend

Stack

- FastAPI
- Python
- Pandas
- OpenPyXL
- httpx

---

## FastAPI

Keep endpoints thin.

Endpoints should:

- validate
- call services
- return responses

Business logic belongs elsewhere.

---

## Services

Complex processing belongs inside feature modules.

Keep SQL separated from business rules.

Avoid giant utility files.

---

## Pandas

Prefer readable transformations.

Avoid chained operations that reduce readability.

Name intermediate DataFrames when it improves understanding.

---

# TypeScript

Never use:

any

Prefer:

unknown

or proper types.

Infer whenever possible.

Export types separately from implementations.

---

# Naming

Names should explain intent.

Good:

calculateCoffeeYield()

Bad:

processData()

Avoid abbreviations.

---

# Functions

Functions should do one thing.

Prefer:

30–40 lines

Return early.

Avoid deep nesting.

---

# Imports

Order

1. React

2. Third-party

3. Internal aliases

4. Relative imports

Remove unused imports.

---

# Styling

Tailwind v4

Source of truth:

app.css

Never use arbitrary colors.

Never use Tailwind palette except:

- white
- black
- transparent

Use design tokens only.

---

# shadcn/ui

Never edit:

src/components/ui/

These files are vendored.

Customization belongs in:

src/components/branded/

Add components using:

npx shadcn@latest add

Never copy documentation code manually.

Preserve Radix structure.

---

# Accessibility

Never remove Radix accessibility behavior.

Buttons must always have accessible labels.

Interactive elements must be keyboard accessible.

---

# Errors

Never silently ignore exceptions.

Errors should explain:

- what failed
- why
- possible next action

---

# Dependencies

Before adding a dependency ask:

1.

Can existing code solve this?

2.

Can it be implemented simply?

3.

Is the dependency maintained?

Prefer fewer dependencies.

---

# Refactoring

Follow the Rule of Three.

1 occurrence

Duplicate.

2 occurrences

Still duplicate.

3 occurrences

Extract abstraction.

Never abstract for hypothetical future use.

---

# Documentation

Whenever architecture changes:

Update relevant documentation.

Do not let docs drift from implementation.

---

# Specs

Specifications are the source of truth.

Workflow:

Spec

↓

Questions

↓

Plan

↓

Implementation

↓

Review

Never guess missing requirements.

Ask instead.

---

# Output

When presenting code changes, always explain:

- what changed
- why
- tradeoffs
- future considerations (if relevant)

Keep explanations concise.

---

# Code Quality Checklist

Before considering a task complete, verify:

☐ No duplicated logic

☐ No dead code

☐ No console.log

☐ No unused imports

☐ Proper typing

☐ Consistent naming

☐ Existing conventions followed

☐ No unnecessary abstractions

☐ Accessible UI

☐ Uses existing architecture

☐ Minimal implementation

☐ Easy to review

If any item fails, fix it before finishing.
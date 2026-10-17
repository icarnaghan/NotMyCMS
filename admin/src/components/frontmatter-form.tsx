import { useMemo } from "react";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import DatePicker from "@cloudscape-design/components/date-picker";
import Textarea from "@cloudscape-design/components/textarea";
import Multiselect, { MultiselectProps } from "@cloudscape-design/components/multiselect";
import Select, { SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import { slugify } from "./slugify";

export interface FrontmatterValue {
  title: string;
  date: string;
  description: string;
  author: string;
  categories: string[];
  tags: string[];
  draft: boolean;
}

export interface FrontmatterFormProps {
  value: FrontmatterValue;
  onChange: (value: FrontmatterValue) => void;
  isNew: boolean;
  availableCategories: string[];
  availableTags: string[];
}

const STATUS_OPTIONS: SelectProps.Option[] = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

export default function FrontmatterForm({
  value,
  onChange,
  isNew,
  availableCategories,
  availableTags,
}: FrontmatterFormProps) {
  const slug = useMemo(() => slugify(value.title), [value.title]);

  const categoryOptions: MultiselectProps.Option[] = useMemo(() => {
    const existing = availableCategories.map((c) => ({ value: c, label: c }));
    // Include any currently selected categories that aren't in the available list
    const extras = value.categories
      .filter((c) => !availableCategories.includes(c))
      .map((c) => ({ value: c, label: c }));
    return [...existing, ...extras];
  }, [availableCategories, value.categories]);

  const tagOptions: MultiselectProps.Option[] = useMemo(() => {
    const existing = availableTags.map((t) => ({ value: t, label: t }));
    // Include any currently selected tags that aren't in the available list
    const extras = value.tags
      .filter((t) => !availableTags.includes(t))
      .map((t) => ({ value: t, label: t }));
    return [...existing, ...extras];
  }, [availableTags, value.tags]);

  const selectedCategories: MultiselectProps.Option[] = value.categories.map((c) => ({
    value: c,
    label: c,
  }));

  const selectedTags: MultiselectProps.Option[] = value.tags.map((t) => ({
    value: t,
    label: t,
  }));

  const selectedStatus: SelectProps.Option = value.draft
    ? { value: "draft", label: "Draft" }
    : { value: "published", label: "Published" };

  return (
    <SpaceBetween size="l">
      <ColumnLayout columns={2}>
        <SpaceBetween size="s">
          <FormField label="Title" description={isNew && slug ? `Slug: ${slug}` : undefined}>
            <Input
              value={value.title}
              onChange={({ detail }) => onChange({ ...value, title: detail.value })}
              placeholder="Enter title"
            />
          </FormField>

          <FormField label="Date">
            <DatePicker
              value={value.date}
              onChange={({ detail }) => onChange({ ...value, date: detail.value })}
              placeholder="YYYY-MM-DD"
              isDateEnabled={() => true}
            />
          </FormField>

          <FormField label="Author">
            <Input
              value={value.author}
              onChange={({ detail }) => onChange({ ...value, author: detail.value })}
              placeholder="Enter author name"
            />
          </FormField>

          <FormField label="Status">
            <Select
              selectedOption={selectedStatus}
              options={STATUS_OPTIONS}
              onChange={({ detail }) =>
                onChange({ ...value, draft: detail.selectedOption.value === "draft" })
              }
            />
          </FormField>
        </SpaceBetween>

        <SpaceBetween size="s">
          <FormField label="Description">
            <Textarea
              value={value.description}
              onChange={({ detail }) => onChange({ ...value, description: detail.value })}
              placeholder="Enter description"
              rows={3}
            />
          </FormField>

          <FormField label="Categories">
            <Multiselect
              selectedOptions={selectedCategories}
              options={categoryOptions}
              onChange={({ detail }) =>
                onChange({
                  ...value,
                  categories: detail.selectedOptions
                    .map((o) => o.value?.trim() ?? "")
                    .filter((v) => v !== ""),
                })
              }
              filteringType="auto"
              placeholder="Select or create categories"
              tokenLimit={3}
            />
          </FormField>

          <FormField label="Tags">
            <Multiselect
              selectedOptions={selectedTags}
              options={tagOptions}
              onChange={({ detail }) =>
                onChange({
                  ...value,
                  tags: detail.selectedOptions
                    .map((o) => o.value?.trim() ?? "")
                    .filter((v) => v !== ""),
                })
              }
              filteringType="auto"
              placeholder="Select or create tags"
              tokenLimit={5}
            />
          </FormField>
        </SpaceBetween>
      </ColumnLayout>
    </SpaceBetween>
  );
}

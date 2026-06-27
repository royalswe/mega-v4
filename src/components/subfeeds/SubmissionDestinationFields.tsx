'use client'

import type { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form'

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SubfeedOption {
  id: number
  name: string
}

interface Labels {
  destinationLabel: string
  destinationPlaceholder: string
  destinationDesc: string
  subfeedLabel: string
  subfeedPlaceholder: string
  subfeedDesc: string
  noSubfeeds: string
}

interface FeedOption {
  value: string
  label: string
}

interface Props<T extends FieldValues> {
  form: UseFormReturn<T>
  feedName: Path<T>
  subfeedIdName: Path<T>
  selectedFeed: string | undefined
  lockDestination?: boolean
  defaultFeed?: string
  subfeeds: SubfeedOption[]
  labels: Labels
  feedOptions: FeedOption[]
}

export function SubmissionDestinationFields<T extends FieldValues>({
  form,
  feedName,
  subfeedIdName,
  selectedFeed,
  lockDestination,
  defaultFeed,
  subfeeds,
  labels,
  feedOptions,
}: Props<T>) {
  return (
    <>
      {!lockDestination ? (
        <FormField
          control={form.control}
          name={feedName}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.destinationLabel}</FormLabel>
              <FormControl>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value)
                    if (value !== 'subfeed') {
                      form.setValue(subfeedIdName, '' as PathValue<T, Path<T>>)
                    }
                  }}
                  defaultValue={field.value as string | undefined}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={labels.destinationPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {feedOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>{labels.destinationDesc}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}

      {(!lockDestination && selectedFeed === 'subfeed') ||
      (lockDestination && defaultFeed === 'subfeed') ? (
        <FormField
          control={form.control}
          name={subfeedIdName}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.subfeedLabel}</FormLabel>
              <FormControl>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value as string | undefined}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={labels.subfeedPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {subfeeds.length > 0 ? (
                      subfeeds.map((subfeed) => (
                        <SelectItem key={subfeed.id} value={String(subfeed.id)}>
                          {subfeed.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="__none" disabled>
                        {labels.noSubfeeds}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>{labels.subfeedDesc}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}
    </>
  )
}

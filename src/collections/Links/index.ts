import type { CollectionConfig } from "payload";

export const Links: CollectionConfig = {
    slug: "links",
    admin: {
        useAsTitle: "title",
    },
    fields: [
        {
            name: "title",
            type: "text",
            required: true,
        },
        {
            name: "url",
            type: "text",
            required: true,
        },
        {
            name: "description",
            type: "textarea",
        },
        {
            name: "type",
            type: "select",
            options: [
                {
                    label: "Article",
                    value: "article",
                },
                {
                    label: "Video",
                    value: "video",
                },
                {
                    label: "Podcast",
                    value: "podcast",
                },
            ],
            required: true,
        }
    ],
};
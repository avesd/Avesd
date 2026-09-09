import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function AgentMarkdown({ text }: {
    readonly text: string;
}) {

    return <div
        className="agent-markdown"
    >
        <Markdown
            skipHtml
            remarkPlugins={[remarkGfm]}
            urlTransform={url => {

                return /^https?:\/\//i.test(url) ? url : "";
            }}
            components={{
                a: ({ href, children }) => {

                    return href ? <a
                        href={href}
                        target="_blank"
                        rel="noreferrer noopener"
                    >
                        {children}
                    </a> : <span>
                        {children}
                    </span>;
                },
                img: ({ alt }) => {

                    return <span
                        className="agent-image-label"
                    >
                        {alt ? `Image: ${alt}` : "Image"}
                    </span>;
                },
            }}
        >
            {text}
        </Markdown>
    </div>;
}

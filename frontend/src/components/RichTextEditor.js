import React, { useEffect, useMemo, useState } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextStyle from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, Quote,
  AlignLeft, AlignCenter, AlignRight, Link as LinkIcon, ImagePlus
} from 'lucide-react';
import { MAX_ATTACHMENT_BYTES, fetchFileBlobUrl, prepareAttachment, uploadInlineImage } from '../helpers';

const TEXT_COLORS = ['#111827', '#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed', '#db2777'];
const HIGHLIGHT_COLORS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa'];
const IMAGE_SIZES = [['25%', 'S'], ['50%', 'M'], ['75%', 'L'], ['100%', 'Full']];

// how a picture looks inside the editor. it downloads with the login token like everywhere else
function ImageNodeView({ node, selected, token }) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);
  const imageId = node.attrs.imageId;

  useEffect(() => {
    let url = '';
    let cancelled = false;
    fetchFileBlobUrl(imageId, token)
      .then((u) => {
        if (cancelled) URL.revokeObjectURL(u);
        else { url = u; setSrc(u); }
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [imageId, token]);

  return (
    <NodeViewWrapper>
      {failed ? (
        <div className="text-xs text-red-600 my-2">Couldn't load this image</div>
      ) : src ? (
        <img
          src={src}
          alt={node.attrs.alt || ''}
          data-width={node.attrs.width}
          data-align={node.attrs.align}
          data-drag-handle
          className={selected ? 'ring-2 ring-indigo-500' : ''}
        />
      ) : (
        <div className="h-24 w-32 rounded-lg bg-gray-100 animate-pulse my-2" />
      )}
    </NodeViewWrapper>
  );
}

// the stock image extension, changed so it stores only the picture's id (no link or base64),
// plus a size and alignment
const AuthImage = Image.extend({
  addOptions() {
    return { ...this.parent?.(), token: '' };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      imageId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-image-id'),
        renderHTML: (attrs) => (attrs.imageId ? { 'data-image-id': attrs.imageId } : {})
      },
      width: {
        default: '100%',
        parseHTML: (el) => el.getAttribute('data-width') || '100%',
        renderHTML: (attrs) => ({ 'data-width': attrs.width })
      },
      align: {
        default: 'center',
        parseHTML: (el) => el.getAttribute('data-align') || 'center',
        renderHTML: (attrs) => ({ 'data-align': attrs.align })
      }
    };
  },
  parseHTML() {
    return [{ tag: 'img[data-image-id]' }];
  },
  addNodeView() {
    const token = this.options.token;
    return ReactNodeViewRenderer((props) => <ImageNodeView {...props} token={token} />);
  }
});

function ToolButton({ onClick, active, title, children }) {
  return (
    <button
      type="button"
      // keeps the cursor and selection in the text when I click a toolbar button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded text-sm ${active ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'}`}
    >
      {children}
    </button>
  );
}

function Swatches({ colors, onPick, label }) {
  return (
    <span className="inline-flex items-center gap-1 px-1">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(c)}
          title={`${label} ${c}`}
          aria-label={`${label} ${c}`}
          className="w-4 h-4 rounded-full border border-gray-300"
          style={{ backgroundColor: c }}
        />
      ))}
    </span>
  );
}

const Divider = () => <span className="w-px h-5 bg-gray-300 mx-1" />;

export default function RichTextEditor({ initialHtml, token, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState('');

  const extensions = useMemo(() => [
    StarterKit,
    Underline,
    Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    AuthImage.configure({ token })
  ], [token]);

  const editor = useEditor({
    extensions,
    content: initialHtml,
    editorProps: { attributes: { class: 'rich-content min-h-[220px] px-4 py-3 focus:outline-none' } },
    onUpdate: ({ editor: ed }) => onChange({ html: ed.getHTML(), isEmpty: ed.isEmpty })
  });

  if (!editor) return null;

  const imageSelected = editor.isActive('image');
  const headingValue = [1, 2, 3].find((l) => editor.isActive('heading', { level: l })) || 0;

  const setHeading = (e) => {
    const level = Number(e.target.value);
    if (level === 0) editor.chain().focus().setParagraph().run();
    else editor.chain().focus().setHeading({ level }).run();
  };

  // the align buttons move the picture if one is selected, otherwise they align the text
  const setAlign = (value) => {
    if (imageSelected) editor.chain().focus().updateAttributes('image', { align: value }).run();
    else editor.chain().focus().setTextAlign(value).run();
  };
  const isAlign = (value) =>
    imageSelected ? editor.getAttributes('image').align === value : editor.isActive({ textAlign: value });

  const setLink = () => {
    const previous = editor.getAttributes('link').href || '';
    const input = window.prompt('Link address (leave empty to remove the link)', previous);
    if (input === null) return;
    const url = input.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const href = /^(https?:\/\/|mailto:|tel:)/i.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };

  const handleImage = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // so picking the same picture twice still works
    if (!file) return;
    setImageError('');
    setUploading(true);
    try {
      if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
        throw new Error('Please choose a JPG, PNG, GIF, or WEBP picture.');
      }
      const ready = await prepareAttachment(file); // shrinks big phone photos first
      if (ready.size > MAX_ATTACHMENT_BYTES) throw new Error('That picture is over the 5 MB limit.');
      const saved = await uploadInlineImage(ready, token);
      editor.chain().focus().insertContent({
        type: 'image',
        attrs: { imageId: saved._id, width: '100%', align: 'center', alt: file.name }
      }).run();
    } catch (err) {
      setImageError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
        <select
          value={String(headingValue)}
          onChange={setHeading}
          className="text-sm border border-gray-300 rounded px-1 py-1 mr-1 bg-white"
          title="Text style"
        >
          <option value="0">Normal</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>

        <ToolButton title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="w-4 h-4" /></ToolButton>
        <ToolButton title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-4 h-4" /></ToolButton>
        <ToolButton title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="w-4 h-4" /></ToolButton>
        <ToolButton title="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="w-4 h-4" /></ToolButton>
        <Divider />
        <ToolButton title="Bulleted list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="w-4 h-4" /></ToolButton>
        <ToolButton title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-4 h-4" /></ToolButton>
        <ToolButton title="Quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="w-4 h-4" /></ToolButton>
        <Divider />
        <ToolButton title="Align left" active={isAlign('left')} onClick={() => setAlign('left')}><AlignLeft className="w-4 h-4" /></ToolButton>
        <ToolButton title="Center" active={isAlign('center')} onClick={() => setAlign('center')}><AlignCenter className="w-4 h-4" /></ToolButton>
        <ToolButton title="Align right" active={isAlign('right')} onClick={() => setAlign('right')}><AlignRight className="w-4 h-4" /></ToolButton>
        <Divider />
        <ToolButton title="Link" active={editor.isActive('link')} onClick={setLink}><LinkIcon className="w-4 h-4" /></ToolButton>
        <label
          htmlFor="inline-image-upload"
          title="Insert a picture at the cursor"
          className={`p-1.5 rounded text-gray-700 ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100'}`}
        >
          <ImagePlus className="w-4 h-4" />
        </label>
        <input
          id="inline-image-upload"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleImage}
          disabled={uploading}
          className="hidden"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-500">
        <span className="inline-flex items-center">
          Text color
          <Swatches colors={TEXT_COLORS} label="Text color" onPick={(c) => editor.chain().focus().setColor(c).run()} />
          <input
            type="color"
            defaultValue="#000000"
            title="Pick any text color"
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            className="w-5 h-5 p-0 border-0 bg-transparent cursor-pointer"
          />
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().unsetColor().run()} className="ml-1 hover:underline">Clear</button>
        </span>
        <span className="inline-flex items-center">
          Highlight
          <Swatches colors={HIGHLIGHT_COLORS} label="Highlight" onPick={(c) => editor.chain().focus().setHighlight({ color: c }).run()} />
          <input
            type="color"
            defaultValue="#fef08a"
            title="Pick any highlight color"
            onChange={(e) => editor.chain().focus().setHighlight({ color: e.target.value }).run()}
            className="w-5 h-5 p-0 border-0 bg-transparent cursor-pointer"
          />
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().unsetHighlight().run()} className="ml-1 hover:underline">Clear</button>
        </span>
        {imageSelected && (
          <span className="inline-flex items-center gap-1">
            Picture size
            {IMAGE_SIZES.map(([value, label]) => (
              <ToolButton
                key={value}
                title={`${label} (${value})`}
                active={editor.getAttributes('image').width === value}
                onClick={() => editor.chain().focus().updateAttributes('image', { width: value }).run()}
              >
                {label}
              </ToolButton>
            ))}
            <ToolButton title="Remove this picture" onClick={() => editor.chain().focus().deleteSelection().run()}>Remove</ToolButton>
          </span>
        )}
        {uploading && <span className="text-indigo-600">Uploading picture…</span>}
      </div>

      {imageError && <p className="text-xs text-red-600 px-3 py-1.5 bg-red-50">{imageError}</p>}

      <EditorContent editor={editor} />
    </div>
  );
}
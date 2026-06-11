interface TrieNode {
  children: Map<string, TrieNode>;
  end: boolean;
}

function makeNode(): TrieNode {
  return { children: new Map(), end: false };
}

/** Dictionary trie. `hasPrefix` powers live swipe feedback and lets the
 * solver prune dead branches instead of walking all 12M grid paths. */
export class Trie {
  private root: TrieNode = makeNode();
  size = 0;

  static fromWords(words: Iterable<string>): Trie {
    const trie = new Trie();
    for (const word of words) trie.insert(word);
    return trie;
  }

  insert(word: string): void {
    let node = this.root;
    for (const ch of word.toUpperCase()) {
      let next = node.children.get(ch);
      if (!next) {
        next = makeNode();
        node.children.set(ch, next);
      }
      node = next;
    }
    if (!node.end) {
      node.end = true;
      this.size++;
    }
  }

  private walk(s: string): TrieNode | undefined {
    let node: TrieNode | undefined = this.root;
    for (const ch of s.toUpperCase()) {
      node = node.children.get(ch);
      if (!node) return undefined;
    }
    return node;
  }

  has(word: string): boolean {
    return this.walk(word)?.end ?? false;
  }

  hasPrefix(prefix: string): boolean {
    return this.walk(prefix) !== undefined;
  }
}

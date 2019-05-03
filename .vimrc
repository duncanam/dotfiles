"----------------------------------------
"__   _(_)_ __ ___  _ __ ___ 
"\ \ / / | '_ ` _ \| '__/ __|
" \ V /| | | | | | | | | (__ 
"  \_/ |_|_| |_| |_|_|  \___|
"                            
" BY DUNCAN MCGOUGH
"----------------------------------------
set nocompatible              " be iMproved, required
filetype off                  " required

"----------------------------------------
" set the runtime path to include Vundle and initialize
set rtp+=~/.vim/bundle/Vundle.vim
call vundle#begin()
" alternatively, pass a path where Vundle should install plugins
"call vundle#begin('~/some/path/here')

" let Vundle manage Vundle, required
Plugin 'VundleVim/Vundle.vim'

" GIVES CONCEAL OF TEXT AND OTHER TEX COMMANDS
Plugin 'KeitaNakamura/tex-conceal.vim'

" POWERFUL TEX PLUGIN WITH FOLDING AND MORE CONCEALMENT
Plugin 'lervag/vimtex'
let g:tex_flavor='latex'
let g:vimtex_fold_enabled=1
let g:vimtex_fold_manual=1
"let g:latex_view_general_viewer = 'zathura'
let g:vimtex_view_method='zathura'
let g:vimtex_quickfix_mode=0
set conceallevel=2
let g:tex_conceal='abdmgs'

" NERDTREE FILE MANAGER
Plugin 'scrooloose/nerdtree'

" VIMWIKI 
Plugin 'vimwiki/vimwiki'

" AIRLINE STATUS BAR
Plugin 'vim-airline/vim-airline'

" GIT BRANCH STUFF
Plugin 'tpope/vim-fugitive'

" NORD SYNTAX COLORSCHEME
Plugin 'arcticicestudio/nord-vim'

" PLUGIN FOR MATLAB SYNTAXING
Plugin 'MatlabFilesEdition'

" POWERFUL PLUGIN FOR SNIPPETS
Plugin 'SirVer/ultisnips'
let g:UltiSnipsEditSplit='tabdo'
let g:UltiSnipsSnippetDirectories=[$HOME.'/.vim/UltiSnips']
let g:UltiSnipsExpandTrigger = '<tab>'
let g:UltiSnipsListSnippets = '<c-l>'
let g:UltiSnipsJumpForwardTrigger='<tab>'
let g:UltiSnipsJumpBackwardTrigger='<s-tab>'

" All of your Plugins must be added before the following line
call vundle#end()            " required
filetype plugin indent on    " required
" To ignore plugin indent changes, instead use:
"filetype plugin on
"
" Brief help
" :PluginList       - lists configured plugins
" :PluginInstall    - installs plugins; append `!` to update or just :PluginUpdate
" :PluginSearch foo - searches for foo; append `!` to refresh local cache
" :PluginClean      - confirms removal of unused plugins; append `!` to auto-approve removal
"
" see :h vundle for more details or wiki for FAQ
" Put your non-Plugin stuff after this line

"----------------------------------------
" Turn on line numbering
set number
set relativenumber
augroup numbertoggle
  autocmd!
  autocmd BufEnter,FocusGained,InsertLeave * set relativenumber
  autocmd BufLeave,FocusLost,InsertEnter   * set norelativenumber
augroup END
"----------------------------------------
" Remap enter for new line without enter mode
nmap <CR> o<C-c>

"----------------------------------------
" Turn on syntax highlighting
syntax on
"----------------------------------------
" Change the the Nord colorscheme settings
let g:nord_italic = 1
let g:nord_underline = 1
"let g:nord_italic_comments = 1
"let g:nord_comment_brightness = 12
"----------------------------------------

" Add Airline Settings
let g:airline_powerline_fonts = 1
" Not sure what this section is so I am disabling it for now:
let g:airline_section_warning = ""

"-----------------------------------------
" Set the cursor in the center of the window when scrolling
set so=999
"-----------------------------------------
" Set local leader
let maplocalleader = "\<Space>"

"-----------------------------------------
" TURN ON SPELL CHECK
setlocal spell spelllang=en_us
set nospell
au BufEnter *.txt setlocal spell spelllang=en_us
au BufEnter *.tex setlocal spell spelllang=en_us
au BufEnter *.md setlocal spell spelllang=en_us
hi clear SpellBad
hi SpellBad cterm=underline

"-----------------------------------------
" Vim Autocomplete
" This sets to only local file
set complete=.

"----------------------------------------
" Enable the Nord Colorscheme
colorscheme nord

"----------------------------------------
" Turn off audoindent for LaTeX
au BufEnter *.tex setlocal indentexpr=

"----------------------------------------
" NERDTree Toggle
map <C-a> :NERDTreeToggle<CR>

"----------------------------------------
" Conceal the background of the conceals
hi Conceal ctermbg=none

"----------------------------------------
" Remap jk to escape fro quick editing
inoremap jk <esc>

"----------------------------------------
" Remap F9 to Python run:
nnoremap <F9> <Esc>:w<CR>:!clear;python  %<CR>

"----------------------------------------
" Code Folding, generic:
"set foldmethod=indent

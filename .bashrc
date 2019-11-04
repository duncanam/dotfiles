#
# ~/.bashrc
#

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

# Add color to LS
alias ls='ls --color=auto'

# Customize prompt
#PS1='[\u@\h \W]\$ '
#PS1='[\[\e[36m\]\u\[\e[m\]@\[\e[35m\]\h \[\e[m\]\W]\$ '
PS1=' \[\e[32m\]\W\[\e[m\] \[\e[36m\]❯\[\e[m\] '

# Start xinit (i3 start is in .xinitrc) 
if [[ "$(tty)" = "/dev/tty1" ]]; then
	startx
fi 

# OpenFOAM Install
#export FOAM_INST_DIR='$HOME/.OpenFOAM'
#alias of20x='source $FOAM_INST_DIR/OpenFOAM-2.0.x/etc/bashrc'
alias ofoam='source /opt/OpenFOAM/OpenFOAM-7/etc/bashrc'
alias paraFoam='paraFoam -builtin'

# MATLAB alias (nojvm disables java features, vastly increases speed)
alias mat='matlab -nosplash -nodesktop'

# Betterlockscreen alias
alias lock='betterlockscreen -l'

# TeX cleaner command
alias texclean='rm *.aux *.log *.out'

# Grow bonsai trees
alias bonsai='~/github/external/bonsai.sh/bonsai.sh'

# Jupyter lab install directory
export JUPYTERLAB_DIR=$HOME/.local/share/jupyter/lab
alias jn='jupyter notebook --ip=0.0.0.0 --port=8080'
alias jl='jupyter lab --ip=0.0.0.0 --port=8080'

# Get me some 256s colors
export TERM=rxvt-256color

# Synchronize ranger and the shell directory with new function:
function ranger-cd {
    tempfile="$(mktemp -t tmp.XXXXXX)"
    ranger --choosedir="$tempfile" "${@:-$(pwd)}"
    test -f "$tempfile" &&
    if [ "$(cat -- "$tempfile")" != "$(echo -n `pwd`)" ]; then
        cd -- "$(cat "$tempfile")"
    fi
    rm -f -- "$tempfile"
}

# Alias for starting ranger in Sync
alias r='ranger-cd'
alias sr='cd ~/sync && ranger-cd'
alias ssr='cd /home/duncan/sync/school/fall2019 && ranger-cd'
alias dr='cd ~/Downloads && ranger-cd'
alias gr='cd ~/github && ranger-cd'

# Add /opt paraview to path
export PATH=$PATH:/opt/paraview/bin

# Test out this thing
eval "$(thefuck --alias)"

